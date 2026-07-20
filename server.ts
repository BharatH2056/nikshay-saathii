import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import authRouter from './src/routes/auth';
import patientsRouter from './src/routes/patients';
import adherenceRouter from './src/routes/adherence';
import remindersRouter from './src/routes/reminders';
import symptomsRouter from './src/routes/symptoms';
import qaRouter from './src/routes/qa';
import dashboardRouter from './src/routes/dashboard';
import escalationsRouter from './src/routes/escalations';
import visitsRouter from './src/routes/visits';
import reportsRouter from './src/routes/reports';
import webhooksRouter from './src/routes/webhooks';
import simulateRouter from './src/routes/simulate';
import adminRouter from './src/routes/admin';

import { seedDatabase, db } from './src/db';
import { healthWorkers, reminders, escalations, patients } from './src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendTwilioMessage } from './src/utils/twilio';
import { startReminderCron } from './src/services/reminderEngine';
import { startSymptomCron } from './src/services/symptomEngine';
import { startAllAutomatedCrons, catchUpOnBoot } from './src/services/automatedCronService';

async function startServer() {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'nikshay_saathi_capstone_jwt_secret_64_character_long_key_development_only')) {
    console.error('FATAL ERROR: JWT_SECRET environment variable is required and must not be the default placeholder in production.');
    process.exit(1);
  }

  const app = express();
  const PORT = 3000;

  // Trust proxy for express-rate-limit
  app.set('trust proxy', 1);

  // Security headers
  // For Vite dev mode compatibility, configure Helmet's Content Security Policy to allow inline styles/scripts or pass custom directives
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Rate Limiters
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts, please try again in 15 minutes.' },
  });

  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120,
    message: { error: 'Rate limit exceeded on webhook ingestion.' },
  });

  // Apply global rate limit to everything except webhooks and simulate routes
  app.use('/v1', (req, res, next) => {
    if (req.path.startsWith('/webhooks') || req.path.startsWith('/simulate')) {
      return next();
    }
    globalLimiter(req, res, next);
  });

  // Mount API routes
  app.use('/v1/auth', authLimiter, authRouter);
  app.use('/v1/patients', patientsRouter);
  app.use('/v1/adherence', adherenceRouter);
  app.use('/v1/reminders', remindersRouter);
  app.use('/v1/symptom-checkins', symptomsRouter);
  app.use('/v1/qa', qaRouter);
  app.use('/v1/dashboard', dashboardRouter);
  app.use('/v1/escalations', escalationsRouter);
  app.use('/v1/visits', visitsRouter);
  app.use('/v1/reports', reportsRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/webhooks', webhookLimiter, webhooksRouter);
  app.use('/v1/simulate', simulateRouter);

  // Health check - wired up for external uptime monitors and alerting on failures
  app.get('/v1/health', async (req, res) => {
    try {
      // 1. Check database connectivity
      let dbStatus = 'healthy';
      let dbError = null;
      try {
        await db.select({ count: sql`COUNT(*)` }).from(healthWorkers).limit(1);
      } catch (err: any) {
        dbStatus = 'unhealthy';
        dbError = err?.message || String(err);
      }

      // 2. Check Reminder Cron Status
      let reminderCronStatus = 'healthy';
      const recentReminders = await db.select()
        .from(reminders)
        .orderBy(sql`created_at DESC`)
        .limit(1);

      const lastReminder = recentReminders[0];
      const lastReminderSentAt = lastReminder ? new Date(lastReminder.scheduledAt) : null;
      
      const activePatientCount = await db.select({ count: sql`COUNT(*)` }).from(patients).where(eq(patients.status, 'active'));
      const patientCount = (activePatientCount[0] as any)?.count || 0;
      
      if (patientCount > 0 && lastReminderSentAt) {
        const msSinceLastReminder = Date.now() - lastReminderSentAt.getTime();
        // If no reminders sent in 26 hours, mark as stalled
        if (msSinceLastReminder > 26 * 60 * 60 * 1000) {
          reminderCronStatus = 'stalled';
        }
      }

      // 3. Check Escalation Alerts backing up
      let escalationQueueStatus = 'healthy';
      const openEscalations = await db.select()
        .from(escalations)
        .where(eq(escalations.status, 'open'));

      const now = Date.now();
      const olderEscalations = openEscalations.filter((esc: any) => {
        const openedAt = new Date(esc.openedAt).getTime();
        return (now - openedAt) > 48 * 60 * 60 * 1000;
      });

      if (olderEscalations.length > 5) {
        escalationQueueStatus = 'backing_up';
      }

      const isHealthy = dbStatus === 'healthy' && reminderCronStatus === 'healthy' && escalationQueueStatus !== 'backing_up';

      const healthReport = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date(),
        checks: {
          database: { status: dbStatus, error: dbError },
          reminderCron: { status: reminderCronStatus, lastSent: lastReminderSentAt },
          escalationQueue: { status: escalationQueueStatus, openCount: openEscalations.length, delayedCount: olderEscalations.length }
        }
      };

      if (!isHealthy) {
        console.error('[UPTIME ALERT] Health check failed! Dispatching alerts...', JSON.stringify(healthReport));
        // Direct Alerting Channel — send immediate failure notification to support contact via SMS/WhatsApp
        const supportPhone = process.env.EMERGENCY_SUPPORT_PHONE || '+919876543211'; // Fallback to admin/mehta
        const supportName = 'System Administrator';
        
        const alertMsg = `⚠️ Nikshay Saathi CRITICAL HEALTH ALERT:\n` +
          `- DB: ${dbStatus}\n` +
          `- Cron: ${reminderCronStatus}\n` +
          `- Escalations: ${escalationQueueStatus}\n` +
          `Please check server logs immediately.`;

        try {
          await sendTwilioMessage({
            phone: supportPhone,
            fullName: supportName,
            channelPref: 'sms' // Send via SMS to ensure delivery even if WhatsApp is down
          }, alertMsg);
          console.log('[UPTIME ALERT] Emergency SMS alert sent to admin at', supportPhone);
        } catch (alertErr: any) {
          console.error('[UPTIME ALERT] Failed to send emergency SMS alert:', alertErr.message);
        }

        return res.status(500).json(healthReport);
      }

      return res.json(healthReport);
    } catch (err: any) {
      console.error('[UPTIME ALERT] Error in health check controller:', err);
      return res.status(500).json({ status: 'unhealthy', error: err.message, timestamp: new Date() });
    }
  });

  // Seed database
  await seedDatabase().catch(err => console.error('[SERVER] Database seeding failed:', err));

  // Start Cron schedulers
  startReminderCron();
  startSymptomCron();
  startAllAutomatedCrons();

  // Run catch-up checks asynchronously
  catchUpOnBoot().catch(err => console.error('[SERVER] Boot catch-up failed:', err));

  // Vite Integration Middleware
  if (process.env.NODE_ENV !== 'production') {
    console.log('[SERVER] Development mode — initializing Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[SERVER] Production mode — serving static files from dist...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Nikshay Saathi full-stack application running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SERVER] Startup failed:', err);
  process.exit(1);
});
