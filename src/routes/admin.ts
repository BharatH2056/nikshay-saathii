import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '@/src/db';
import { healthWorkers, patients, adherenceLogs, escalations, reminders } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { decryptPatient } from '../utils/crypto';
import { runScheduledCloudBackup, restoreFromBackupDump } from '../services/backupEngine';

const router = Router();

// Apply auth protection to all admin routes
router.use(authMiddleware);
router.use(adminOnly);

// GET /v1/admin/workers - List all health workers with aggregated patient counts & alerts
router.get('/workers', async (req: AuthRequest, res) => {
  try {
    const workers = await db.select().from(healthWorkers);
    const allPatients = await db.select().from(patients);
    
    const workersWithStats = [];

    for (const hw of workers) {
      const hwPatients = allPatients.filter(p => p.healthWorkerId === hw.id);
      const totalPatients = hwPatients.length;
      
      const redAlerts = hwPatients.filter(p => p.riskLevel === 'red' && p.status === 'active').length;
      const yellowAlerts = hwPatients.filter(p => p.riskLevel === 'yellow' && p.status === 'active').length;
      const greenCount = hwPatients.filter(p => p.riskLevel === 'green' && p.status === 'active').length;

      // Calculate health worker's overall patient adherence
      let totalDoses = 0;
      let takenDoses = 0;

      // Retrieve adherence metrics for this health worker's patients
      for (const p of hwPatients) {
        const logs = await db.select()
          .from(adherenceLogs)
          .where(eq(adherenceLogs.patientId, p.id));
        totalDoses += logs.length;
        takenDoses += logs.filter(l => l.status).length;
      }

      const avgAdherence = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 100;

      workersWithStats.push({
        id: hw.id,
        fullName: hw.fullName,
        email: hw.email,
        phone: hw.phone,
        role: hw.role,
        region: hw.region || 'Unassigned',
        isActive: hw.isActive !== false,
        stats: {
          totalPatients,
          redAlerts,
          yellowAlerts,
          greenCount,
          avgAdherence
        }
      });
    }

    res.json(workersWithStats);
  } catch (error) {
    console.error('Fetch admin workers error:', error);
    res.status(500).json({ error: 'Failed to fetch health workers list' });
  }
});

// POST /v1/admin/workers - Add a new Health Worker / Admin
router.post('/workers', async (req: AuthRequest, res) => {
  const { fullName, email, phone, password, region, role } = req.body;

  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ error: 'Full name, email, phone, and password are required' });
  }

  try {
    // Check if user already exists
    const existing = await db.select().from(healthWorkers).where(eq(healthWorkers.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert new user
    const [newWorker] = await db.insert(healthWorkers).values({
      fullName,
      email,
      phone,
      passwordHash,
      role: role || 'hw',
      region: region || null,
      isActive: true,
    }).returning();

    res.status(201).json({
      success: true,
      worker: {
        id: newWorker.id,
        fullName: newWorker.fullName,
        email: newWorker.email,
        phone: newWorker.phone,
        role: newWorker.role,
        region: newWorker.region,
      }
    });
  } catch (error) {
    console.error('Create health worker error:', error);
    res.status(500).json({ error: 'Failed to create new health worker' });
  }
});

// GET /v1/admin/summary - Dynamic administrative metrics
router.get('/summary', async (req: AuthRequest, res) => {
  try {
    const regionFilter = req.query.region as string;

    // Fetch all health workers
    const allWorkers = await db.select().from(healthWorkers);
    const uniqueRegions = Array.from(new Set(allWorkers.map(w => w.region).filter(Boolean)));

    // Filter health workers by region if specified
    let workers = [...allWorkers];
    if (regionFilter && regionFilter !== 'all') {
      workers = workers.filter(w => w.region === regionFilter);
    }
    const workerIds = workers.map(w => w.id);

    // Fetch and filter active patients
    let activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));
    if (regionFilter && regionFilter !== 'all') {
      activePatients = activePatients.filter(p => p.healthWorkerId && workerIds.includes(p.healthWorkerId));
    }

    // Filter active escalations
    let activeEscalations = await db.select().from(escalations).where(eq(escalations.status, 'open'));
    if (regionFilter && regionFilter !== 'all') {
      activeEscalations = activeEscalations.filter(e => workerIds.includes(e.healthWorkerId));
    }

    // Compute overall stats
    const totalPatients = activePatients.length;
    const totalWorkers = workers.length;
    const totalEscalations = activeEscalations.length;

    // Region summary by protocol
    const regionsMap: Record<string, { total: number; red: number; yellow: number; green: number }> = {};
    activePatients.forEach(p => {
      const regionName = p.condition || 'TB';
      if (!regionsMap[regionName]) {
        regionsMap[regionName] = { total: 0, red: 0, yellow: 0, green: 0 };
      }
      regionsMap[regionName].total++;
      if (p.riskLevel === 'red') regionsMap[regionName].red++;
      else if (p.riskLevel === 'yellow') regionsMap[regionName].yellow++;
      else regionsMap[regionName].green++;
    });

    const regionSummary = Object.keys(regionsMap).map(name => ({
      name,
      ...regionsMap[name]
    }));

    // Cohort Adherence Curve over treatment duration weeks (Week 1 to Week 6+)
    // We group all adherence logs by how many weeks after treatment start they were logged
    const cohortWeeks: Record<number, { taken: number; total: number }> = {};
    for (let w = 1; w <= 6; w++) {
      cohortWeeks[w] = { taken: 0, total: 0 };
    }

    const allLogs = await db.select().from(adherenceLogs);
    
    activePatients.forEach(p => {
      if (!p.treatmentStart) return;
      const startMs = new Date(p.treatmentStart).getTime();
      
      const patientLogs = allLogs.filter(l => l.patientId === p.id);
      
      patientLogs.forEach(l => {
        const logMs = new Date(l.logDate).getTime();
        const diffDays = Math.floor((logMs - startMs) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) {
          const week = Math.floor(diffDays / 7) + 1;
          const cappedWeek = Math.min(week, 6);
          if (cappedWeek >= 1 && cappedWeek <= 6) {
            cohortWeeks[cappedWeek].total++;
            if (l.status) {
              cohortWeeks[cappedWeek].taken++;
            }
          }
        }
      });
    });

    const cohortAdherenceCurve = Object.keys(cohortWeeks).map(w => {
      const weekNum = Number(w);
      const data = cohortWeeks[weekNum];
      const calculatedRate = data.total > 0 ? Math.round((data.taken / data.total) * 100) : null;
      return {
        week: `Wk ${weekNum}`,
        adherence: calculatedRate,
        patients: data.total > 0 ? Math.round(data.total / 7) : 0
      };
    });

    res.json({
      totalPatients,
      totalWorkers,
      totalEscalations,
      regionSummary,
      uniqueRegions,
      cohortAdherenceCurve
    });
  } catch (error) {
    console.error('Fetch admin summary error:', error);
    res.status(500).json({ error: 'Failed to fetch admin summary' });
  }
});

// GET /v1/admin/run-tests - Execute unit/integration tests for riskClassifier & escalationEngine
router.get('/run-tests', async (req: AuthRequest, res) => {
  try {
    const { runEngineTests } = await import('../utils/testRunner');
    const testResult = await runEngineTests();
    res.json(testResult);
  } catch (error) {
    console.error('Run engine tests error:', error);
    res.status(500).json({ error: 'Failed to execute engine tests' });
  }
});

// GET /v1/admin/health - Monitor database, cron heartbeat, and escalation alerts
router.get('/health', async (req: AuthRequest, res) => {
  try {
    // 1. Check database connectivity
    let dbStatus = 'healthy';
    let dbError = null;
    try {
      await db.select({ count: sql`COUNT(*)` }).from(healthWorkers);
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
    const lastReminderSentAt = lastReminder ? new Date(Number(lastReminder.scheduledAt) * 1000) : null;
    
    const activePatientCount = await db.select({ count: sql`COUNT(*)` }).from(patients).where(eq(patients.status, 'active'));
    const patientCount = (activePatientCount[0] as any)?.count || 0;
    
    if (patientCount > 0 && lastReminderSentAt) {
      const msSinceLastReminder = Date.now() - lastReminderSentAt.getTime();
      if (msSinceLastReminder > 24 * 60 * 60 * 1000) {
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
      const openedAt = new Date(Number(esc.openedAt) * 1000).getTime();
      return (now - openedAt) > 48 * 60 * 60 * 1000;
    });

    if (olderEscalations.length > 5) {
      escalationQueueStatus = 'backing_up';
    }

    // 4. Count backups
    const backupDir = path.join(process.cwd(), 'backups');
    let backupCount = 0;
    if (fs.existsSync(backupDir)) {
      backupCount = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).length;
    }

    res.json({
      status: dbStatus === 'healthy' && reminderCronStatus === 'healthy' && escalationQueueStatus === 'healthy' ? 'healthy' : 'warning',
      dbStatus,
      dbError,
      reminderCronStatus,
      escalationQueueStatus,
      lastReminderSentAt: lastReminderSentAt ? lastReminderSentAt.toISOString() : null,
      openEscalationsCount: openEscalations.length,
      staleEscalationsCount: olderEscalations.length,
      backupCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('System health check error:', error);
    res.status(500).json({ error: 'Failed to perform system health check', details: error?.message });
  }
});

// POST /v1/admin/backup - Perform verified DB hot backup to backups/ directory & offsite cloud storage
router.post('/backup', async (req: AuthRequest, res) => {
  try {
    const backupResult = await runScheduledCloudBackup();
    const stats = fs.statSync(backupResult.localPath);

    res.json({
      success: true,
      message: 'Verified database snapshot created and synchronized offsite successfully.',
      fileName: backupResult.fileName,
      sizeBytes: stats.size,
      offsite: backupResult.offsite,
      createdAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Database backup error:', error);
    res.status(500).json({ error: 'Failed to create database backup', details: error?.message });
  }
});

// GET /v1/admin/backups - List all available backups
router.get('/backups', async (req: AuthRequest, res) => {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db') || f.endsWith('.json'))
      .map(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        return {
          fileName: file,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json(files);
  } catch (error: any) {
    console.error('List backups error:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// POST /v1/admin/restore - Restore DB from a specific backup file
router.post('/restore', async (req: AuthRequest, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: 'Backup file name is required' });
  }

  // Strict sanitization & path traversal check
  if (typeof fileName !== 'string' || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return res.status(400).json({ error: 'Invalid backup file name (directory traversal attempt blocked)' });
  }

  // Ensure it matches only safe, alphanumeric/dash/underscore/dot patterns with .db or .json extension
  const safeNameRegex = /^[a-zA-Z0-9_\-\.]+\.(db|json)$/;
  if (!safeNameRegex.test(fileName)) {
    return res.status(400).json({ error: 'Invalid backup file name format. Only backup .db and .json files are allowed.' });
  }

  try {
    const backupDir = path.join(process.cwd(), 'backups');
    const backupFilePath = path.join(backupDir, fileName);

    // Double check resolution
    const relativePath = path.relative(backupDir, backupFilePath);
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      return res.status(400).json({ error: 'Invalid backup path resolution' });
    }

    if (!fs.existsSync(backupFilePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    if (fileName.endsWith('.json')) {
      console.log(`[RESTORE] Initiating JSON-based PostgreSQL database restore from ${fileName}...`);
      await restoreFromBackupDump(backupFilePath);
      
      logger.info(`[RESTORE] Successfully restored PostgreSQL database from JSON backup: ${fileName}.`);
      return res.json({
        success: true,
        message: 'PostgreSQL database restored successfully from JSON backup snapshot.',
      });
    } else {
      const dbPath = path.join(process.cwd(), 'nikshay.db');

      // Create a temporary backup of the CURRENT db before restoring just in case
      const dbBackupPath = path.join(backupDir, `nikshay_pre_restore_backup_${Date.now()}.db`);
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, dbBackupPath);
      }

      // Overwrite current DB with backup
      fs.copyFileSync(backupFilePath, dbPath);

      logger.info(`[RESTORE] Successfully restored SQLite database from backup: ${fileName}. A pre-restore safety snapshot was saved to ${path.basename(dbBackupPath)}.`);

      return res.json({
        success: true,
        message: 'SQLite database restored successfully. System restarted in-memory context.',
        safetySnapshot: path.basename(dbBackupPath)
      });
    }
  } catch (error: any) {
    console.error('Restore database error:', error);
    res.status(500).json({ error: 'Database restore failed', details: error?.message });
  }
});

// GET /v1/admin/export/nikshay - Export patient adherence logs for local clinical audits, record-keeping, and administrative review
router.get('/export/nikshay', async (req: AuthRequest, res) => {
  try {
    const patientsList = await db.select().from(patients);
    const activeOrCompleted = patientsList.filter(p => p.status === 'active' || p.status === 'completed');
    
    if (activeOrCompleted.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=nikshay_adherence_report.csv');
      return res.status(200).send('Nikshay ID,Patient Name,Adherence Date,Dose Status,CHW Supervisor Name\n');
    }

    const workers = await db.select().from(healthWorkers);
    const workersMap = new Map(workers.map(w => [w.id, w.fullName]));
    
    const logs = await db.select().from(adherenceLogs);

    // Header row for local clinical adherence and compliance report
    const csvRows = ['Nikshay ID,Patient Name,Adherence Date,Dose Status,CHW Supervisor Name'];

    // Helper to safely escape CSV values
    const escapeCsvValue = (val: string | null | undefined): string => {
      if (!val) return '';
      const stringified = String(val);
      if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
      }
      return stringified;
    };

    for (const p of activeOrCompleted) {
      const decryptedP = decryptPatient(p);
      const patientLogs = logs.filter(l => l.patientId === decryptedP.id);
      const chwName = decryptedP.healthWorkerId ? (workersMap.get(decryptedP.healthWorkerId) || 'Unassigned') : 'Unassigned';
      
      const pNameEsc = escapeCsvValue(decryptedP.fullName);
      const chwNameEsc = escapeCsvValue(chwName);
      // Use the actual user-submitted Nikshay ID from patient profile, do not fabricate fake government identifiers
      const nikshayIdVal = decryptedP.nikshayId || 'Not Registered';
      const nikshayIdEsc = escapeCsvValue(nikshayIdVal);

      if (patientLogs.length === 0) {
        csvRows.push(`${nikshayIdEsc},${pNameEsc},,No Logged Doses,${chwNameEsc}`);
      } else {
        for (const log of patientLogs) {
          const statusStr = log.status ? 'Taken' : 'Prescribed/Missed';
          csvRows.push(`${nikshayIdEsc},${pNameEsc},${log.logDate},${statusStr},${chwNameEsc}`);
        }
      }
    }

    const csvContent = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=nikshay_adherence_report.csv');
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export Nikshay error:', error);
    res.status(500).json({ error: 'Failed to generate Nikshay export report' });
  }
});

export default router;
