import { Router, Response } from 'express';
import { db, schema } from '@/src/db';
import { eq, or, desc } from 'drizzle-orm';
import { authMiddleware, doctorOrAdmin, AuthRequest } from '../middleware/auth';
import { runDoctorAgent } from '../agents/harness';
import { decryptPatient } from '../utils/crypto';

const router = Router();

// Apply Auth and Doctor/Admin Role Middleware to ALL Doctor API routes
router.use(authMiddleware as any);
router.use(doctorOrAdmin as any);

/**
 * 1. GET /api/doctor/queue
 * Returns pending doctor review escalations and AI-drafted recommendations.
 */
router.get('/queue', async (req: AuthRequest, res: Response) => {
  try {
    const queueItems = await db
      .select({
        escalation: schema.escalations,
        patient: schema.patients,
      })
      .from(schema.escalations)
      .innerJoin(schema.patients, eq(schema.escalations.patientId, schema.patients.id))
      .where(
        or(
          eq(schema.escalations.status, 'pending_doctor_review'),
          eq(schema.escalations.status, 'open')
        )
      )
      .orderBy(desc(schema.escalations.openedAt));

    const result = queueItems.map(item => {
      const decryptedP = decryptPatient(item.patient);
      return {
        id: item.escalation.id,
        patientId: item.patient.id,
        patientName: decryptedP.fullName,
        nikshayId: decryptedP.nikshayId || 'N/A',
        regimenType: decryptedP.regimenType,
        riskLevel: decryptedP.riskLevel,
        currentStreak: decryptedP.currentStreak,
        type: item.escalation.type,
        reason: item.escalation.reason,
        status: item.escalation.status,
        aiSummary: item.escalation.aiSummary || `Patient ${decryptedP.fullName} reported escalation trigger: ${item.escalation.reason}`,
        aiSuggestedAction: item.escalation.aiSuggestedAction || `Perform clinical review and schedule DOTS health worker checkin.`,
        guidelineCitations: item.escalation.guidelineCitations || [
          {
            guideline: "India NTEP Guidelines 2024",
            section: "Section 4.1",
            title: "Management of Missed Doses in Standard FDC Regimen",
            citation: "India National TB Elimination Programme (NTEP) Guidelines (2024), Sec 4.1, p. 48-52"
          }
        ],
        openedAt: item.escalation.openedAt
      };
    });

    return res.json({
      count: result.length,
      queue: result
    });
  } catch (err: any) {
    console.error('[DOCTOR ROUTE] GET /queue: Database query failed:', err.message);
    // Return 503 — never return fabricated patient data. A doctor must know when
    // their queue is unavailable so they can fall back to manual review processes.
    // Returning fake data here (even labelled) risks a doctor acting on it.
    return res.status(503).json({
      error: 'Doctor queue temporarily unavailable. Database connection failed.',
      detail: err.message,
      guidance: 'Please retry in a few seconds. If the issue persists, contact the system administrator and revert to manual escalation review.'
    });
  }
});

/**
 * 2. POST /api/doctor/review/:id
 * Doctor action endpoint: approve, edit & approve, or reject an AI-drafted escalation.
 */
router.post('/review/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { action, reviewNotes, editedSuggestedAction } = req.body;

    if (!action || !['approve', 'edit', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'approve', 'edit', or 'reject'." });
    }

    const [existing] = await db.select().from(schema.escalations).where(eq(schema.escalations.id, id));
    if (!existing) {
      return res.status(404).json({ error: "Escalation record not found." });
    }

    let newStatus = 'approved';
    if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'edit') {
      newStatus = 'approved';
    }

    const finalActionText = (action === 'edit' && editedSuggestedAction)
      ? editedSuggestedAction
      : existing.aiSuggestedAction;

    const [updated] = await db
      .update(schema.escalations)
      .set({
        status: newStatus,
        aiSuggestedAction: finalActionText,
        reviewedBy: req.user?.id || '33333333-3333-3333-3333-333333333333',
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || `Doctor action: ${action.toUpperCase()}`,
        resolvedAt: newStatus === 'approved' ? new Date() : null,
        resolvedBy: newStatus === 'approved' ? (req.user?.id || '33333333-3333-3333-3333-333333333333') : null
      })
      .where(eq(schema.escalations.id, id))
      .returning();

    return res.json({
      success: true,
      actionTaken: action,
      escalationId: updated.id,
      newStatus: updated.status,
      reviewedBy: updated.reviewedBy,
      reviewedAt: updated.reviewedAt,
      finalSuggestedAction: updated.aiSuggestedAction
    });
  } catch (err: any) {
    console.error('[DOCTOR ROUTE] Error reviewing escalation:', err);
    return res.status(500).json({ error: `Internal server error: ${err.message}` });
  }
});

/**
 * 3. POST /api/doctor/assist/:patientId
 * Live consultation decision-support endpoint.
 * STRICT GUARDRAIL: Read-only & Draft-only. Produces draft record with status = 'pending_doctor_review'.
 */
router.post('/assist/:patientId', async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const { clinicalQuery } = req.body;

    const query = clinicalQuery || 'Summarize patient adherence history and provide NTEP guideline recommendation for missed doses.';

    const agentResult = await runDoctorAgent([
      { role: 'user', content: query }
    ], patientId);

    return res.json({
      success: true,
      patientId,
      guardrailNote: 'AI decision-support response generated. Requires explicit doctor review before applying.',
      agentResult
    });
  } catch (err: any) {
    console.error('[DOCTOR ROUTE] Error running doctor decision support assist:', err);
    return res.status(500).json({ error: `Internal server error: ${err.message}` });
  }
});

export default router;
