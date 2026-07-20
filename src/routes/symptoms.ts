import { Router } from 'express';
import { db } from '@/src/db';
import { symptomCheckins } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { processSymptomReply } from '../services/symptomEngine';
import { SymptomResponseSchema } from '@/src/types';
import { z } from 'zod';

const router = Router();

router.get('/:id/symptoms', authMiddleware, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const list = await db.select()
      .from(symptomCheckins)
      .where(eq(symptomCheckins.patientId, id))
      .orderBy(desc(symptomCheckins.checkinDate));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch symptom logs' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id, responses } = req.body;
  if (!patient_id || !responses) {
    return res.status(400).json({ error: 'patient_id and responses are required' });
  }

  try {
    const parsedResponses = SymptomResponseSchema.parse(responses);
    const checkin = await processSymptomReply(patient_id, parsedResponses);
    res.status(201).json(checkin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    console.error('Symptom check-in error:', error);
    res.status(500).json({ error: 'Failed to record symptom check-in' });
  }
});

export default router;
