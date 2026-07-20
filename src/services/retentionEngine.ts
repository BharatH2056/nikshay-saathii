import { db } from '../db';
import { patients, auditLogs } from '../db/schema';
import { eq, and, lte, inArray } from 'drizzle-orm';
import crypto from 'crypto';

export async function runDataRetentionPurge() {
  console.log('[RETENTION ENGINE] Running DPDP Compliance Retention Policy check...');
  try {
    // Retention period: 180 days (6 months)
    const retentionDays = 180;
    const thresholdDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const candidates = await db.select()
      .from(patients)
      .where(
        and(
          inArray(patients.status, ['opted_out', 'completed']),
          lte(patients.updatedAt, thresholdDate)
        )
      );

    console.log(`[RETENTION ENGINE] Found ${candidates.length} inactive patients older than ${retentionDays} days to purge/anonymize.`);

    for (const p of candidates) {
      try {
        console.log(`[RETENTION ENGINE] Purging/anonymizing patient PII for patient ID: ${p.id}...`);

        // Generate a unique anonymous phone suffix to avoid unique constraint violations
        const uniqueSuffix = crypto.randomBytes(3).toString('hex');
        const anonymizedPhone = `+9100000${uniqueSuffix}`;

        // Anonymize patient PII fields (leaving non-PII and adherence stats for reporting)
        await db.update(patients)
          .set({
            fullName: 'Anonymized Patient',
            phone: anonymizedPhone,
            caregiverName: 'Anonymized Caregiver',
            caregiverPhone: null,
            caregiverRelation: null,
            stickyNote: null,
            updatedAt: new Date(),
          })
          .where(eq(patients.id, p.id));

        // Log the action to audit logs
        await db.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorId: '22222222-2222-2222-2222-222222222222', // System Admin / Mehta DTO ID
          actorEmail: 'system@nikshay.in',
          action: 'PURGE_PATIENT',
          patientId: p.id,
          patientName: 'Anonymized Patient',
          details: `Successfully purged PII for patient ID ${p.id} after ${retentionDays} days of inactivity for DPDP Act compliance.`,
          createdAt: new Date(),
        });

        console.log(`[RETENTION ENGINE] Successfully anonymized PII for patient ID: ${p.id}`);
      } catch (patientErr) {
        console.error(`[RETENTION ENGINE ERROR] Failed to purge patient ${p.id}:`, patientErr);
      }
    }
  } catch (err) {
    console.error('[RETENTION ENGINE GLOBAL ERROR] Retention policy check failed:', err);
  }
}
