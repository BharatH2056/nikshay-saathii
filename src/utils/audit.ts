import { db } from '../db';
import { auditLogs } from '../db/schema';

export async function logAudit(
  actor: { id: string; email: string },
  action: string,
  patientId?: string | null,
  patientName?: string | null,
  details?: string | null
) {
  try {
    await db.insert(auditLogs).values({
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      patientId: patientId || null,
      patientName: patientName || null,
      details: details || null,
    });
    console.log(`[AUDIT LOG] ${action} by ${actor.email} on patient ${patientName || patientId || 'N/A'}`);
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
}
