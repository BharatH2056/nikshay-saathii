import { Router } from 'express';
import { db } from '@/src/db';
import { escalations, patients } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const { status } = req.query;

  try {
    let conditions = [];
    if (status) {
      conditions.push(eq(escalations.status, status as string));
    }

    const list = await db.select({
      id: escalations.id,
      patientId: escalations.patientId,
      patientName: patients.fullName,
      patientPhone: patients.phone,
      patientRiskLevel: patients.riskLevel,
      type: escalations.type,
      reason: escalations.reason,
      status: escalations.status,
      openedAt: escalations.openedAt,
      acknowledgedAt: escalations.acknowledgedAt,
      resolvedAt: escalations.resolvedAt,
    })
      .from(escalations)
      .innerJoin(patients, eq(escalations.patientId, patients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(escalations.openedAt));

    res.json(list);
  } catch (error) {
    console.error('Fetch escalations error:', error);
    res.status(500).json({ error: 'Failed to fetch escalations' });
  }
});

router.post('/:id/acknowledge', authMiddleware, async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const [updated] = await db.update(escalations)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date()
      })
      .where(eq(escalations.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Escalation not found' });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge escalation' });
  }
});

router.post('/:id/resolve', authMiddleware, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { resolution_notes } = req.body;

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const currentEscalation = await db.query.escalations.findFirst({
      where: eq(escalations.id, id),
    });

    if (!currentEscalation) {
      return res.status(404).json({ error: 'Escalation not found' });
    }

    const [updated] = await db.update(escalations)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: req.user.id,
        reason: resolution_notes ? `${currentEscalation.reason || ''} | Notes: ${resolution_notes}` : undefined
      })
      .where(eq(escalations.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve escalation' });
  }
});

export default router;
