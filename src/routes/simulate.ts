import { Router } from 'express';
import { db } from '@/src/db';
import { patients, adherenceLogs, reminders } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { computeRisk } from '../services/riskClassifier';
import { checkAndAutoResolve } from '../services/escalationEngine';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { handlePatientQA } from '../services/llmService';
import { processSymptomReply } from '../services/symptomEngine';
import { MESSAGES } from '../services/reminderEngine';

const router = Router();

// 1. Simulate inbound message from patient (without Twilio)
router.post('/reply', authMiddleware, async (req: AuthRequest, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }

  const bodyText = message.trim().toUpperCase();

  try {
    const patientRecord = await db.select().from(patients).where(eq(patients.phone, phone)).limit(1);
    if (patientRecord.length === 0) {
      return res.status(404).json({ error: 'Phone number not enrolled.' });
    }

    const p = patientRecord[0];
    const lang = p.language === 'ka' ? 'ka' : 'en';

    if (['DONE', 'YES', '1', 'ಹೌದು'].includes(bodyText)) {
      const todayStr = new Date().toISOString().split('T')[0];

      const existing = await db.select()
        .from(adherenceLogs)
        .where(and(
          eq(adherenceLogs.patientId, p.id),
          eq(adherenceLogs.logDate, todayStr)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(adherenceLogs)
          .set({ status: true, responseText: message, respondedAt: new Date() })
          .where(eq(adherenceLogs.id, existing[0].id));
      } else {
        await db.insert(adherenceLogs).values({
          patientId: p.id,
          logDate: todayStr,
          status: true,
          responseText: message,
          respondedAt: new Date()
        });
      }

      const risk = await computeRisk(p.id);
      await checkAndAutoResolve(p.id);

      const successReply = lang === 'ka' ? 'ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಇಂದಿನ ಡೋಸ್ ದಾಖಲಾಗಿದೆ.' : 'Thank you! Your dose for today has been logged.';
      return res.json({ response: successReply, risk });
    }

    if (bodyText === 'STOP') {
      await db.update(patients).set({ status: 'opted_out' }).where(eq(patients.id, p.id));
      const stopReply = lang === 'ka' ? 'ಚಂದಾದಾರಿಕೆಯನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.' : 'You have been opted out of reminders.';
      return res.json({ response: stopReply });
    }

    const parts = bodyText.split(/\s+/);
    if (parts.length === 4 && parts.every((v: string) => ['1', '2', '3'].includes(v))) {
      const answers = {
        vomiting: parts[0] === '1',
        yellow_eyes: parts[1] === '1',
        stomach_pain: parts[2] === '1' ? 'severe' : (parts[2] === '2' ? 'mild' : 'none'),
        appetite_loss: parts[3] === '1',
      } as const;

      await processSymptomReply(p.id, answers);

      const surveySuccess = lang === 'ka' ? 'ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಲಕ್ಷಣಗಳ ಸಮೀಕ್ಷೆ ಪೂರ್ಣಗೊಂಡಿದೆ.' : 'Thank you! Your weekly symptom check-in has been logged.';
      return res.json({ response: surveySuccess });
    }

    // Fallback: If not a known command or symptom check, pass to Q&A Engine
    const reply = await handlePatientQA(p.id, message, lang, p.condition);
    return res.json({ response: reply });
  } catch (error) {
    console.error('Simulation reply error:', error);
    res.status(500).json({ error: 'Failed to process simulated reply' });
  }
});

// 2. Simulate next day progression (Mark unresponded as Missed/False)
router.post('/day', authMiddleware, async (req: AuthRequest, res) => {
  const { date_offset } = req.body; // e.g. 1 means yesterday, 0 means today
  const targetDate = new Date();
  if (date_offset !== undefined) {
    targetDate.setDate(targetDate.getDate() - Number(date_offset));
  }
  const dateStr = targetDate.toISOString().split('T')[0];

  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));
    
    for (const p of activePatients) {
      // Check if patient already has an adherence log for this date
      const log = await db.select()
        .from(adherenceLogs)
        .where(and(
          eq(adherenceLogs.patientId, p.id),
          eq(adherenceLogs.logDate, dateStr)
        ))
        .limit(1);

      if (log.length === 0) {
        // Log as MISSED dose (status = false)
        await db.insert(adherenceLogs).values({
          patientId: p.id,
          logDate: dateStr,
          status: false,
          responseText: 'NO_RESPONSE',
        });

        // Recompute risk level
        await computeRisk(p.id);
      }
    }

    res.json({ success: true, message: `Processed missed doses for date: ${dateStr}` });
  } catch (error) {
    console.error('Day simulation error:', error);
    res.status(500).json({ error: 'Failed to simulate day' });
  }
});

export default router;
