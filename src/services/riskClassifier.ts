import { db } from '@/src/db';
import { adherenceLogs, patients, escalations } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sendTwilioMessage } from '../utils/twilio';
import { getNormalizedLanguage, maskName } from '../utils/patient';
import { decryptPatient } from '../utils/crypto';

export async function computeRisk(patientId: string) {
  // 1. Get recent logs (last 7 days)
  const logs = await db.select()
    .from(adherenceLogs)
    .where(eq(adherenceLogs.patientId, patientId))
    .orderBy(desc(adherenceLogs.logDate))
    .limit(7);

  // 2. Count taken and missed
  const takenCount = logs.filter(l => l.status).length;
  const loggedCount = logs.length;
  const adherenceRate = loggedCount > 0 ? (takenCount / loggedCount) * 100 : 100;

  // 3. Compute consecutive missed doses
  let consecutiveMissed = 0;
  for (const log of logs) {
    if (!log.status) {
      consecutiveMissed++;
    } else {
      break;
    }
  }

  // 4. Check if there is a missed dose in the last 3 days
  const recent3Logs = logs.slice(0, 3);
  const missedInLast3 = recent3Logs.some(l => !l.status);

  // 5. Determine new risk level
  let newRisk: 'green' | 'yellow' | 'red' = 'green';
  if (adherenceRate < 50 || consecutiveMissed >= 2) {
    newRisk = 'red';
  } else if ((adherenceRate >= 50 && adherenceRate < 80) || missedInLast3) {
    newRisk = 'yellow';
  }

  // 6. Compute current streak (consecutive positive adherence logs starting from most recent)
  let currentStreak = 0;
  for (const log of logs) {
    if (log.status) {
      currentStreak++;
    } else {
      break;
    }
  }

  // 7. Update patient risk level and streak in DB
  await db.update(patients)
    .set({
      riskLevel: newRisk,
      currentStreak: currentStreak,
      updatedAt: new Date()
    })
    .where(eq(patients.id, patientId));

  // 8. If Red, auto-create escalation
  if (newRisk === 'red') {
    const existingEsc = await db.select()
      .from(escalations)
      .where(and(
        eq(escalations.patientId, patientId),
        eq(escalations.status, 'open')
      ))
      .limit(1);

    if (existingEsc.length === 0) {
      const patientRecord = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
      if (patientRecord.length > 0 && patientRecord[0].healthWorkerId) {
        const decryptedP = decryptPatient(patientRecord[0]);
        await db.insert(escalations).values({
          patientId,
          healthWorkerId: decryptedP.healthWorkerId,
          type: 'MISSED_DOSES',
          reason: `Patient risk state dropped to Red. Adherence rate: ${adherenceRate.toFixed(0)}%. Streak: ${currentStreak}.`,
          status: 'open',
        });

        // Notify caregiver of missed doses
        if (decryptedP.caregiverPhone && decryptedP.caregiverName) {
          const cgLang = getNormalizedLanguage(decryptedP.language);
          const cgText = cgLang === 'ka'
            ? `ಅಪಾಯದ ಎಚ್ಚರಿಕೆ: ${decryptedP.fullName} ರವರು ಸತತವಾಗಿ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳದೆ ಇದ್ದಾರೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣ ಅವರ ಆರೋಗ್ಯವನ್ನು ವಿಚಾರಿಸಿ.`
            : `URGENT ALERT: ${decryptedP.fullName} has missed multiple consecutive doses. Please check in on them immediately to ensure adherence.`;
          
          const maskedPhone = decryptedP.caregiverPhone.replace(/.(?=.{4})/g, '*');
          const maskedCgName = maskName(decryptedP.caregiverName);
          const maskedPatName = maskName(decryptedP.fullName);
          console.log(`[CAREGIVER ALERT] Sending risk alert to ${maskedCgName} (${maskedPhone}) for patient ${maskedPatName}`);

          await sendTwilioMessage({
            phone: decryptedP.caregiverPhone,
            fullName: decryptedP.caregiverName,
            channelPref: decryptedP.caregiverChannelPref || 'whatsapp'
          }, cgText);
        }
      }
    }
  }

  return { riskLevel: newRisk, currentStreak, adherenceRate };
}
