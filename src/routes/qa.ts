import { Router } from 'express';
import { db } from '@/src/db';
import { qaSessions, patients } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { handlePatientQA } from '../services/llmService';

const router = Router();

router.post('/ask', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id, message } = req.body;
  if (!patient_id || !message) {
    return res.status(400).json({ error: 'patient_id and message are required' });
  }

  try {
    const patientRecord = await db.select().from(patients).where(eq(patients.id, patient_id)).limit(1);
    if (patientRecord.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const p = patientRecord[0];
    const lang = p.language === 'ka' ? 'ka' : 'en';

    const response = await handlePatientQA(patient_id, message, lang, p.condition);
    res.json({ response });
  } catch (error) {
    console.error('QA Assistant error:', error);
    res.status(500).json({ error: 'Failed to process Q&A query' });
  }
});

router.get('/sessions', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id } = req.query;
  if (!patient_id) {
    return res.status(400).json({ error: 'patient_id query param is required' });
  }

  try {
    const sessions = await db.select()
      .from(qaSessions)
      .where(eq(qaSessions.patientId, patient_id as string))
      .orderBy(desc(qaSessions.updatedAt));
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Q&A sessions' });
  }
});

export default router;
