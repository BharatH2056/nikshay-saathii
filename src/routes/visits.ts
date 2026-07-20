import { Router } from 'express';
import { db } from '@/src/db';
import { visits, escalations, patients } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id, notes, follow_up_date } = req.body;
  if (!patient_id) {
    return res.status(400).json({ error: 'patient_id is required' });
  }

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Create visit log
    const [visit] = await db.insert(visits).values({
      patientId: patient_id,
      healthWorkerId: req.user.id,
      notes: notes || null,
      followUpDate: follow_up_date || null,
      visitedAt: new Date()
    }).returning();

    // 2. Resolve open escalations for this patient
    await db.update(escalations)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: req.user.id,
      })
      .where(and(
        eq(escalations.patientId, patient_id),
        eq(escalations.status, 'open')
      ));

    // 3. Update patient risk level: Red -> Yellow transition
    const patientRecord = await db.select().from(patients).where(eq(patients.id, patient_id)).limit(1);
    if (patientRecord.length > 0) {
      const p = patientRecord[0];
      if (p.riskLevel === 'red') {
        await db.update(patients)
          .set({
            riskLevel: 'yellow',
            updatedAt: new Date()
          })
          .where(eq(patients.id, patient_id));
      }
    }

    res.status(201).json(visit);
  } catch (error) {
    console.error('Visit logging error:', error);
    res.status(500).json({ error: 'Failed to record visit' });
  }
});

router.get('/:id/visits', authMiddleware, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const list = await db.select()
      .from(visits)
      .where(eq(visits.patientId, id))
      .orderBy(desc(visits.visitedAt));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

export default router;
