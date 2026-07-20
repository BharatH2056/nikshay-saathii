import cron from 'node-cron';
import { db } from '@/src/db';
import { patients, reminders, escalations } from '@/src/db/schema';
import { eq, and, lte, or, isNull } from 'drizzle-orm';
import { sendTwilioMessage } from '../utils/twilio';
import { getPatientById, getNormalizedLanguage, maskName } from '../utils/patient';
import { PatientStatus, MessageStatus, CommunicationChannel } from '../constants/enums';

export const MESSAGES = {
  en: {
    dailyReminder: "Hello! Time to take your daily TB medication. Please reply DONE or 1 once taken.",
    welcome: "Welcome to Nikshay Saathi! We will help monitor your daily TB treatment progress.",
    unknown: "We didn't understand that. Please reply DONE or 1 to confirm your daily medicine dose.",
    symptomCheck: "Sunday Symptom Check-In:\n1. Vomiting? Reply 1 for Yes, 2 for No.\n2. Yellow eyes? Reply 1 for Yes, 2 for No.\n3. Stomach pain? Reply 1 for Severe, 2 for Mild, 3 for None.\n4. Appetite loss? Reply 1 for Yes, 2 for No.",
    symptomSevere: "This is a severe symptom warning. Please contact your health worker immediately or visit the nearest DOTS center.",
  },
  ka: {
    dailyReminder: "ನಮಸ್ಕಾರ! ಈ ದಿನದ TB ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. ತೆಗೆದುಕೊಂಡ ನಂತರ ದಯವಿಟ್ಟು DONE ಅಥವಾ 1 ಎಂದು ಉತ್ತರಿಸಿ.",
    welcome: "ನಿಕ್ಷಯ್ ಸಾಥಿಗೆ ತಮಗೆ ಸ್ವಾಗತ! ಪ್ರತಿದಿನ ನಿಮ್ಮ TB ಚಿಕಿತ್ಸೆಯ ಪ್ರಗತಿಯನ್ನು ಮೇಲ್ವಿಚಾರಣೆ ಮಾಡಲು ನಾವು ಸಹಾಯ ಮಾಡುತ್ತೇವೆ.",
    unknown: "ನಮಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ದೈನಂದಿನ ಔಷಧ ಪ್ರಮಾಣವನ್ನು ದೃಢೀಕರಿಸಲು ದಯವಿಟ್ಟು DONE ಅಥವಾ 1 ಎಂದು ಉತ್ತರಿಸಿ.",
    symptomCheck: "ಭಾನುವಾರದ ಲಕ್ಷಣಗಳ ಪರಿಶೀಲನೆ:\n1. ವಾಂತಿ? ಹೌದು ಎನ್ನಲು 1, ಇಲ್ಲ ಎನ್ನಲು 2 ಎಂದು ಉತ್ತರಿಸಿ.\n2. ಕಣ್ಣು ಹಳದಿ? ಹೌದು ಎನ್ನಲು 1, ಇಲ್ಲ ಎನ್ನಲು 2 ಎಂದು ಉತ್ತರಿಸಿ.\n3. ಹೊಟ್ಟೆ ನೋವು? ತೀವ್ರ ಎನ್ನಲು 1, ಸೌಮ್ಯ ಎನ್ನಲು 2, ಇಲ್ಲ ಎನ್ನಲು 3 ಎಂದು ಉತ್ತರಿಸಿ.\n4. ಊಟದ ಅರುಚಿ? ಹೌದು ಎನ್ನಲು 1, ಇಲ್ಲ ಎನ್ನಲು 2 ಎಂದು ಉತ್ತರಿಸಿ.",
    symptomSevere: "ಇದು ತೀವ್ರ ಲಕ್ಷಣಗಳ ಮುನ್ನೆಚ್ಚರಿಕೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣ ನಿಮ್ಮ ಆರೋಗ್ಯ ಕಾರ್ಯಕರ್ತರನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ ಹತ್ತಿರದ DOTS ಕೇಂದ್ರಕ್ಕೆ ಭೇಟಿ ನೀಡಿ.",
  }
};

export async function sendDailyReminder(patientId: string) {
  const p = await getPatientById(patientId);
  if (!p || p.status !== PatientStatus.ACTIVE) return null;

  // Check if treatment has ended
  if (p.treatmentStart && p.treatmentDurationDays) {
    const startDate = new Date(p.treatmentStart);
    const endDate = new Date(startDate.getTime() + p.treatmentDurationDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    if (now > endDate) {
      console.log(`Patient ${p.id} has completed their ${p.treatmentDurationDays} day treatment. Auto-completing.`);
      await db.update(patients).set({ status: 'completed', updatedAt: new Date() }).where(eq(patients.id, p.id));
      return null;
    }
  }

  const lang = getNormalizedLanguage(p.language);
  const text = MESSAGES[lang].dailyReminder;

  const { sid, status } = await sendTwilioMessage(p, text);

  // Caregiver notification logic
  if (p.caregiverPhone && p.caregiverName) {
    const cgText = lang === 'ka'
      ? `ಸಹಾಯಕರ ಗಮನಕ್ಕೆ: ${p.fullName} ರವರು ಇಂದು ತಮ್ಮ TB ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವಂತೆ ದಯವಿಟ್ಟು ಗಮನಿಸಿ. ಧನ್ಯವಾದಗಳು!`
      : `Supporter Notice: Please ensure ${p.fullName} takes their daily TB medication today. Thank you for your support!`;
    
    // Send to caregiver
    const caregiverObj = {
      phone: p.caregiverPhone,
      fullName: p.caregiverName,
      channelPref: p.caregiverChannelPref || 'whatsapp'
    };
    
    const maskedPhone = p.caregiverPhone.replace(/.(?=.{4})/g, '*');
    const maskedCgName = maskName(p.caregiverName);
    const maskedPatName = maskName(p.fullName);
    console.log(`[CAREGIVER] Sending adherence support message to ${maskedCgName} (${maskedPhone}) for patient ${maskedPatName}`);
    await sendTwilioMessage(caregiverObj, cgText);
  }

  const [reminder] = await db.insert(reminders).values({
    patientId: p.id,
    scheduledAt: new Date(),
    sentAt: new Date(),
    channel: p.channelPref,
    status,
    messageContent: text,
    externalId: sid,
  }).returning();

  return reminder;
}

export const triggerAllActiveReminders = async (timeLabel: string) => {
  console.log(`Reminder Engine: Running manual/cron job at ${timeLabel} IST`);
  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, PatientStatus.ACTIVE));

    // Process in parallel with a simple limit to avoid overwhelming Twilio/DB
    const BATCH_SIZE = 10;
    for (let i = 0; i < activePatients.length; i += BATCH_SIZE) {
      const batch = activePatients.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(p => sendDailyReminder(p.id)));
    }
  } catch (e) {
    console.error(`Error running reminder cron (${timeLabel}):`, e);
  }
};

export const processFailedRemindersRetryQueue = async () => {
  console.log('[RETRY QUEUE] Scanning for failed reminders to retry...');
  try {
    const failedReminders = await db.select()
      .from(reminders)
      .where(
        and(
          eq(reminders.status, 'failed'),
          or(
            isNull(reminders.nextAttemptAt),
            lte(reminders.nextAttemptAt, new Date())
          )
        )
      );

    console.log(`[RETRY QUEUE] Found ${failedReminders.length} failed reminders eligible for retry.`);

    for (const rem of failedReminders) {
      try {
        const patientObj = await getPatientById(rem.patientId);
        if (!patientObj) continue;

        const currentRetryCount = rem.retryCount || 0;
        const newRetryCount = currentRetryCount + 1;

        console.log(`[RETRY QUEUE] Attempting retry #${newRetryCount} for reminder ${rem.id} to patient ${maskName(patientObj.fullName)}...`);
        const { sid, status } = await sendTwilioMessage(patientObj, rem.messageContent);

        if (status === 'sent') {
          console.log(`[RETRY QUEUE SUCCESS] Retry #${newRetryCount} for reminder ${rem.id} succeeded. SID: ${sid}`);
          await db.update(reminders).set({
            status: 'sent',
            sentAt: new Date(),
            externalId: sid,
            retryCount: newRetryCount,
            nextAttemptAt: null,
          }).where(eq(reminders.id, rem.id));
        } else {
          console.warn(`[RETRY QUEUE FAILED] Retry #${newRetryCount} for reminder ${rem.id} failed.`);

          if (newRetryCount >= 3) {
            console.error(`[RETRY QUEUE EXCEEDED] Reminder ${rem.id} permanently failed after 3 attempts. Escalating...`);
            await db.update(reminders).set({
              status: 'permanently_failed',
              retryCount: newRetryCount,
              nextAttemptAt: null,
            }).where(eq(reminders.id, rem.id));

            if (patientObj.healthWorkerId) {
              const existingEsc = await db.select()
                .from(escalations)
                .where(and(
                  eq(escalations.patientId, patientObj.id),
                  eq(escalations.type, 'REMINDER_FAILED'),
                  eq(escalations.status, 'open')
                ))
                .limit(1);

              if (existingEsc.length === 0) {
                await db.insert(escalations).values({
                  patientId: patientObj.id,
                  healthWorkerId: patientObj.healthWorkerId,
                  type: 'REMINDER_FAILED',
                  reason: `Medication reminder message failed to deliver after 3 attempts. Please follow up with patient ${patientObj.fullName} (${patientObj.phone}) manually.`,
                  status: 'open',
                });
                console.log(`[RETRY QUEUE ESCALATED] Created REMINDER_FAILED escalation for patient ${maskName(patientObj.fullName)}.`);
              }
            }
          } else {
            const backoffMinutes = newRetryCount * 30;
            const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000);
            console.log(`[RETRY QUEUE BACKOFF] Scheduling next retry attempt in ${backoffMinutes} minutes (at ${nextAttempt.toISOString()})`);

            await db.update(reminders).set({
              retryCount: newRetryCount,
              nextAttemptAt: nextAttempt,
            }).where(eq(reminders.id, rem.id));
          }
        }
      } catch (itemErr) {
        console.error(`[RETRY QUEUE ITEM ERROR] Failed to process retry for reminder ${rem.id}:`, itemErr);
      }
    }
  } catch (err) {
    console.error('[RETRY QUEUE GLOBAL ERROR] Failed to run retry queue scan:', err);
  }
};

export function startReminderCron() {
  // 8:00 AM
  cron.schedule('0 8 * * *', () => triggerAllActiveReminders('08:00'));
  // 3:00 PM
  cron.schedule('0 15 * * *', () => triggerAllActiveReminders('15:00'));
  // 8:00 PM
  cron.schedule('0 20 * * *', () => triggerAllActiveReminders('20:00'));
  // Retry queue - every 30 minutes
  cron.schedule('*/30 * * * *', () => processFailedRemindersRetryQueue());
}
