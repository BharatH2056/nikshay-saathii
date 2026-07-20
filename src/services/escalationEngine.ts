import { db } from '@/src/db';
import { escalations, adherenceLogs } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { EscalationStatus } from '../constants/enums';

export async function checkAndAutoResolve(patientId: string) {
  const openEsc = await db.select()
    .from(escalations)
    .where(and(
      eq(escalations.patientId, patientId),
      eq(escalations.status, EscalationStatus.OPEN)
    ))
    .limit(1);

  if (openEsc.length === 0) return;

  const logs = await db.select()
    .from(adherenceLogs)
    .where(eq(adherenceLogs.patientId, patientId))
    .orderBy(desc(adherenceLogs.logDate))
    .limit(3);

  if (logs.length >= 3 && logs.every(l => l.status)) {
    await db.update(escalations)
      .set({
        status: EscalationStatus.AUTO_RESOLVED,
        resolvedAt: new Date(),
      })
      .where(and(
        eq(escalations.patientId, patientId),
        eq(escalations.status, EscalationStatus.OPEN)
      ));
    console.log(`Escalation Engine: Auto-resolved open alerts for patient ${patientId}`);
  }
}
