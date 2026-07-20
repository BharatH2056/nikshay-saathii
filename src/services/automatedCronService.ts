import cron from 'node-cron';
import { db } from '@/src/db';
import { patients, adherenceLogs, reminders, escalations } from '@/src/db/schema';
import { eq, and, gte, inArray } from 'drizzle-orm';
import { computeRisk } from './riskClassifier';
import { triggerAllActiveReminders } from './reminderEngine';
import { sendTwilioMessage } from '../utils/twilio';
import { getNormalizedLanguage, calculateMedicationDaysRemaining } from '../utils/patient';
import { decryptPatient } from '../utils/crypto';
import { runScheduledCloudBackup } from './backupEngine';

/**
 * 1. Daily scan of silent patients who did not reply "DONE" today.
 * Inserts a missed log (status = false) and computes risk.
 */
export async function runDailySilentPatientScan(dateStr: string) {
  console.log(`[DAILY SCAN] Checking for silent patients for date: ${dateStr}`);
  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));
    let count = 0;
    
    for (const pRecord of activePatients) {
      try {
        const p = decryptPatient(pRecord);
        
        // Check if there is already an adherence log for this date
        const existing = await db.select()
          .from(adherenceLogs)
          .where(and(
            eq(adherenceLogs.patientId, p.id),
            eq(adherenceLogs.logDate, dateStr)
          ))
          .limit(1);

        if (existing.length === 0) {
          // Create missed dose log (status = false)
          await db.insert(adherenceLogs).values({
            patientId: p.id,
            logDate: dateStr,
            status: false,
            responseText: 'NO_RESPONSE',
            respondedAt: new Date()
          });

          // Recompute risk level & trigger caregiver alert / escalation if drop to Red
          await computeRisk(p.id);
          count++;
        }
      } catch (patientErr) {
        console.error(`[DAILY SCAN] Error scanning patient ${pRecord.id}:`, patientErr);
      }
    }
    console.log(`[DAILY SCAN] Completed. Marked ${count} silent patients as MISSED for date: ${dateStr}`);
  } catch (err) {
    console.error('[DAILY SCAN] Error scanning silent patients:', err);
  }
}

/**
 * 2. Daily refill-alert assessment for active patients running low on medicationSupplyDays.
 * Calculates days remaining via treatment start / last refill date and alerts CHW / caregiver / patient.
 */
export async function runDailyRefillCheck() {
  console.log('[REFILL CHECK] Running medication supply refill assessment...');
  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));
    let alertsSent = 0;

    for (const pRecord of activePatients) {
      try {
        const p = decryptPatient(pRecord);
        const remaining = calculateMedicationDaysRemaining(p.treatmentStart, p.lastRefillDate, p.medicationSupplyDays);
        
        if (remaining <= 3) {
          const lang = getNormalizedLanguage(p.language);
          
          // 1. Notify Patient
          const patientMsg = lang === 'ka'
            ? `ಜ್ಞಾಪನೆ: ನಿಮ್ಮ ಚಿಕಿತ್ಸೆಯ ಔಷಧಿ ಪೂರೈಕೆ ಕೇವಲ ${remaining} ದಿನಗಳು ಉಳಿದಿವೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣ ಮರುಪೂರಣಕ್ಕಾಗಿ ಭೇಟಿ ನೀಡಿ.`
            : `REFILL REMINDER: You only have ${remaining} days of medication supply left. Please visit your DOTS provider immediately for a refill.`;
          
          await sendTwilioMessage(p, patientMsg);

          // 2. Notify Caregiver (if present)
          if (p.caregiverPhone && p.caregiverName) {
            const cgMsg = lang === 'ka'
              ? `ಸಹಾಯಕರ ಗಮನಕ್ಕೆ: ${p.fullName} ರವರ ಔಷಧಿ ಪೂರೈಕೆ ಕೇವಲ ${remaining} ದಿನಗಳು ಉಳಿದಿವೆ. ದಯವಿಟ್ಟು ಮರುಪೂರಣ ಮಾಡಲು ಸಹಾಯ ಮಾಡಿ.`
              : `Supporter Notice: ${p.fullName} only has ${remaining} days of medication supply left. Please assist them in getting a refill.`;
            
            const caregiverObj = {
              phone: p.caregiverPhone,
              fullName: p.caregiverName,
              channelPref: p.caregiverChannelPref || 'whatsapp'
            };
            
            const maskedPhone = p.caregiverPhone.replace(/.(?=.{4})/g, '*');
            console.log(`[REFILL ALERT] Notifying supporter ${p.caregiverName} (${maskedPhone}) about low medication supply (${remaining} days)`);
            await sendTwilioMessage(caregiverObj, cgMsg);
          }

          // 3. Open Escalation for CHW (if no open refill escalation exists)
          const existingEsc = await db.select()
            .from(escalations)
            .where(and(
              eq(escalations.patientId, p.id),
              eq(escalations.type, 'REFILL_ALERT'),
              eq(escalations.status, 'open')
            ))
            .limit(1);

          if (existingEsc.length === 0 && p.healthWorkerId) {
            await db.insert(escalations).values({
              patientId: p.id,
              healthWorkerId: p.healthWorkerId,
              type: 'REFILL_ALERT',
              reason: `Patient medication supply running low: only ${remaining} days left. Last refill: ${p.lastRefillDate || p.treatmentStart}.`,
              status: 'open',
            });
          }
          alertsSent++;
        }
      } catch (patientErr) {
        console.error(`[REFILL CHECK] Error checking refill for patient ${pRecord.id}:`, patientErr);
      }
    }
    console.log(`[REFILL CHECK] Completed. Alerts sent / verified for ${alertsSent} patients.`);
  } catch (err) {
    console.error('[REFILL CHECK] Error running refill check:', err);
  }
}

/**
 * 3. Catch-up logic on boot (server restart protection)
 * Checks if key schedules were missed and fires them if needed.
 */
export async function catchUpOnBoot() {
  console.log('[BOOT CATCH-UP] Starting catch-up assessments...');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  try {
    // 1. Check reminders catch-up (did we miss a notification window today?)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const remindersToday = await db.select()
      .from(reminders)
      .where(and(
        inArray(reminders.status, ['sent', 'delivered']),
        gte(reminders.scheduledAt, todayStart)
      ))
      .limit(1);

    const currentHour = now.getHours();

    if (remindersToday.length === 0 && currentHour >= 8) {
      console.log('[BOOT CATCH-UP] No reminders sent today yet and current hour is past 8:00 AM. Triggering catch-up reminders...');
      let slotLabel = '08:00';
      if (currentHour >= 20) {
        slotLabel = '20:00';
      } else if (currentHour >= 15) {
        slotLabel = '15:00';
      }
      await triggerAllActiveReminders(`${slotLabel} (Boot Catch-up)`);
    }

    // 2. Check if yesterday's silent scan was missed
    const noResponseLogsYesterday = await db.select()
      .from(adherenceLogs)
      .where(and(
        eq(adherenceLogs.logDate, yesterdayStr),
        eq(adherenceLogs.responseText, 'NO_RESPONSE')
      ))
      .limit(1);

    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active')).limit(1);

    if (activePatients.length > 0 && noResponseLogsYesterday.length === 0) {
      console.log(`[BOOT CATCH-UP] No missed-dose scan detected for yesterday (${yesterdayStr}). Triggering catch-up scan...`);
      await runDailySilentPatientScan(yesterdayStr);
    }

    // 3. Run refill alert checks (always safe to run on boot)
    console.log('[BOOT CATCH-UP] Running initial boot medication refill scan...');
    await runDailyRefillCheck();

    // 4. Run data retention purge check (always safe to run on boot)
    console.log('[BOOT CATCH-UP] Running initial boot data retention policy checks...');
    const { runDataRetentionPurge } = await import('./retentionEngine');
    await runDataRetentionPurge().catch(err => console.error('[BOOT CATCH-UP] Retention purge failed:', err));

    console.log('[BOOT CATCH-UP] Catch-up checks finished successfully.');
  } catch (err) {
    console.error('[BOOT CATCH-UP] Error during catch-up checks:', err);
  }
}

/**
 * 4. Register cron jobs
 */
export function startAllAutomatedCrons() {
  // Silent patient check runs daily at 11:30 PM (23:30)
  cron.schedule('30 23 * * *', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    runDailySilentPatientScan(todayStr);
  });

  // Refill check runs daily at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    runDailyRefillCheck();
  });

  // Data retention purge runs daily at 12:00 AM (midnight)
  cron.schedule('0 0 * * *', async () => {
    const { runDataRetentionPurge } = await import('./retentionEngine');
    runDataRetentionPurge();
  });

  // Daily verified cloud backup runs daily at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    runScheduledCloudBackup().catch(err => console.error('[CRON ENGINE] Daily cloud backup failed:', err));
  });

  console.log('[CRON ENGINE] Registered automated silent-patient, refill, data-retention, and cloud-backup crons.');
}
