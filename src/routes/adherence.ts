import { Router } from 'express';
import { db } from '@/src/db';
import { adherenceLogs } from '@/src/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { computeRisk } from '../services/riskClassifier';
import { checkAndAutoResolve } from '../services/escalationEngine';

const router = Router();

router.get('/by-date/:date', authMiddleware, async (req: AuthRequest, res) => {
  const { date } = req.params;
  try {
    const logs = await db.select()
      .from(adherenceLogs)
      .where(eq(adherenceLogs.logDate, date));
    res.json(logs);
  } catch (error) {
    console.error('Failed to fetch logs by date:', error);
    res.status(500).json({ error: 'Failed to fetch logs for date' });
  }
});

router.get('/:id/adherence', authMiddleware, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { from, to } = req.query;

  try {
    let conditions = [eq(adherenceLogs.patientId, id)];
    if (from) {
      conditions.push(gte(adherenceLogs.logDate, from as string));
    }
    if (to) {
      conditions.push(lte(adherenceLogs.logDate, to as string));
    }

    const logs = await db.select()
      .from(adherenceLogs)
      .where(and(...conditions))
      .orderBy(adherenceLogs.logDate);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch adherence logs' });
  }
});

router.post('/log', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id, log_date, status, response_text } = req.body;

  if (!patient_id || !log_date || status === undefined) {
    return res.status(400).json({ error: 'patient_id, log_date, and status are required' });
  }

  try {
    // Upsert logic using database resolution / clean checks
    const existing = await db.select()
      .from(adherenceLogs)
      .where(and(
        eq(adherenceLogs.patientId, patient_id),
        eq(adherenceLogs.logDate, log_date)
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(adherenceLogs)
        .set({
          status,
          responseText: response_text || null,
          respondedAt: new Date(),
        })
        .where(eq(adherenceLogs.id, existing[0].id));
    } else {
      await db.insert(adherenceLogs).values({
        patientId: patient_id,
        logDate: log_date,
        status,
        responseText: response_text || null,
        respondedAt: new Date(),
      });
    }

    // 1. Recompute patient risk states
    const riskResult = await computeRisk(patient_id);
    
    // 2. Check for auto-resolution on 3 consecutive positive replies
    await checkAndAutoResolve(patient_id);

    res.json({ success: true, ...riskResult });
  } catch (error) {
    console.error('Adherence logging error:', error);
    res.status(500).json({ error: 'Failed to log adherence' });
  }
});

export default router;
