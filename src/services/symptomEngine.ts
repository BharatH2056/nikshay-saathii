import { db } from '@/src/db';
import { patients, symptomCheckins, escalations } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import cron from 'node-cron';
import { MESSAGES } from './reminderEngine';
import { sendTwilioMessage } from '../utils/twilio';
import { getPatientById, getNormalizedLanguage } from '../utils/patient';
import { PatientStatus, EscalationStatus, EscalationType } from '../constants/enums';

export async function sendSymptomSurvey(patientId: string) {
  const p = await getPatientById(patientId);
  if (!p || p.status !== PatientStatus.ACTIVE) return null;

  const lang = getNormalizedLanguage(p.language);
  const text = MESSAGES[lang].symptomCheck;

  await sendTwilioMessage(p, text);
}

export function startSymptomCron() {
  cron.schedule('0 10 * * 0', async () => {
    console.log('Symptom Engine: Running Sunday cron job at 10:00');
    try {
      const activePatients = await db.select().from(patients).where(eq(patients.status, PatientStatus.ACTIVE));

      const BATCH_SIZE = 10;
      for (let i = 0; i < activePatients.length; i += BATCH_SIZE) {
        const batch = activePatients.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(p => sendSymptomSurvey(p.id)));
      }
    } catch (e) {
      console.error('Error running symptom survey cron:', e);
    }
  });
}

export async function processSymptomReply(patientId: string, answers: { vomiting: boolean; yellow_eyes: boolean; stomach_pain: 'none' | 'mild' | 'severe'; appetite_loss: boolean }) {
  let severityScore = 0;
  if (answers.vomiting) severityScore++;
  if (answers.yellow_eyes) severityScore++;
  if (answers.stomach_pain === 'severe') severityScore++;
  if (answers.appetite_loss) severityScore++;

  const checkinDateStr = new Date().toISOString().split('T')[0];
  const escalated = severityScore >= 2 || answers.yellow_eyes;

  const [checkin] = await db.insert(symptomCheckins).values({
    patientId,
    checkinDate: checkinDateStr,
    responses: answers,
    severityScore,
    escalated,
  }).returning();

  const p = await getPatientById(patientId);
  if (!p) return checkin;

  if (escalated && p.healthWorkerId) {
    await db.insert(escalations).values({
      patientId,
      healthWorkerId: p.healthWorkerId,
      type: EscalationType.SYMPTOM_SEVERE,
      reason: `Patient reported severe symptoms (score: ${severityScore}/4). Details: Vomiting: ${answers.vomiting ? 'Yes' : 'No'}, Yellow eyes: ${answers.yellow_eyes ? 'Yes' : 'No'}, Stomach pain: ${answers.stomach_pain}, Appetite loss: ${answers.appetite_loss ? 'Yes' : 'No'}.`,
      status: EscalationStatus.OPEN,
    });

    const lang = getNormalizedLanguage(p.language);
    const alertText = MESSAGES[lang].symptomSevere;
    await sendTwilioMessage(p, alertText);
  }

  return checkin;
}
