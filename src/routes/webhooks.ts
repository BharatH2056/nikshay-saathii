import { Router } from 'express';
import { db } from '@/src/db';
import { patients, adherenceLogs, reminders } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { computeRisk } from '../services/riskClassifier';
import { checkAndAutoResolve } from '../services/escalationEngine';
import { handlePatientQA } from '../services/llmService';
import { processSymptomReply } from '../services/symptomEngine';
import { MESSAGES } from '../services/reminderEngine';
import twilio from 'twilio';
import { logger } from '../utils/logger';
import { decrypt, decryptPatient } from '../utils/crypto';
import { getTwilioAuthToken, sendTwilioMessage } from '../utils/twilio';
import { getPatientById } from '../utils/patient';

const router = Router();

// ── Normalize any phone format to E.164 (+91XXXXXXXXXX) ──────────────────
function normalizeIncomingPhone(raw: string): string {
  // Strip Twilio WhatsApp prefix
  let phone = raw.replace('whatsapp:', '').trim();
  // Remove all non-digit characters except leading +
  const hasPlus = phone.startsWith('+');
  const digits = phone.replace(/\D/g, '');
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

router.post('/twilio', async (req, res) => {
  const { From, Body } = req.body;

  logger.info('[Webhook] Incoming Twilio message received', { From, BodyLength: Body?.length });

  if (!From || !Body) {
    logger.warn('[Webhook] Missing From or Body — rejecting');
    return res.status(400).send('From and Body are required');
  }

  // Input Validation (P1)
  if (typeof From !== 'string' || typeof Body !== 'string') {
    logger.warn('[Webhook] Invalid types for From or Body — rejecting');
    return res.status(400).send('From and Body must be strings');
  }

  if (From.length > 50 || Body.length > 1000) {
    logger.warn('[Webhook] From or Body exceeds length limits — rejecting');
    return res.status(400).send('From or Body exceeds permitted length');
  }

  // Twilio signature verification (P0)
  const twilioSignature = req.headers['x-twilio-signature'] as string;
  const authToken = getTwilioAuthToken();

  if (authToken) {
    if (!twilioSignature) {
      logger.warn('[Webhook] Missing X-Twilio-Signature header — rejecting');
      return res.status(401).send('Unauthorized: Missing Twilio signature');
    }

    const protocol = req.headers['x-forwarded-proto'] as string || req.protocol;
    const host = req.headers['x-forwarded-host'] as string || req.get('host');
    let url = `${protocol}://${host}${req.originalUrl}`;

    if (process.env.APP_URL) {
      try {
        const parsedAppUrl = new URL(process.env.APP_URL);
        url = `${parsedAppUrl.protocol}//${parsedAppUrl.host}${req.originalUrl}`;
      } catch (e) {
        // Fallback to auto-constructed URL
      }
    }

    const isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);
    if (!isValid) {
      logger.warn('[Webhook] Invalid Twilio Signature — rejecting', { url });
      return res.status(403).send('Forbidden: Invalid Twilio signature');
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.warn('[Webhook] TWILIO_AUTH_TOKEN is not configured in production — rejecting all webhooks');
    return res.status(500).send('Webhook server is not configured correctly');
  }

  const phone = normalizeIncomingPhone(From);
  const bodyText = Body.trim().toUpperCase();

  logger.info('[Webhook] Normalized webhook metadata', { phone, bodyText });

  res.header('Content-Type', 'text/xml');

  try {
    // Since phone numbers are encrypted at rest, we must fetch all and compare decrypted phone values
    const allPatients = await db.select().from(patients);
    const decryptedPatients = allPatients.map(p => {
      try {
        return decryptPatient(p);
      } catch (err) {
        return p;
      }
    });

    // Primary lookup — exact E.164 match
    let matchedPatient = decryptedPatients.find(p => p.phone === phone);

    // Fallback — try without leading +, or last 10 digits
    if (!matchedPatient) {
      const digits10 = phone.replace(/\D/g, '').slice(-10);
      logger.warn('[Webhook] Exact phone match failed. Trying last-10-digit fallback', { digits10 });
      matchedPatient = decryptedPatients.find(p => p.phone.replace(/\D/g, '').slice(-10) === digits10);
    }

    if (!matchedPatient) {
      logger.warn('[Webhook] No patient found for incoming phone number', { phone });
      return res.send('<Response><Message>Phone number not enrolled in Nikshay Saathi.</Message></Response>');
    }

    const p = matchedPatient;
    const lang = p.language === 'ka' ? 'ka' : 'en';

    logger.info('[Webhook] Matched active patient profile', { 
      patientId: p.id, 
      patientStatus: p.status, 
      lang 
    });

    // ── Route 1: Adherence confirmation ─────────────────────────────────────
    if (['DONE', 'YES', '1', 'ಹೌದು'].includes(bodyText)) {
      console.log('[Webhook] → Route: ADHERENCE CONFIRMATION');
      const todayStr = new Date().toISOString().split('T')[0];

      const existing = await db.select()
        .from(adherenceLogs)
        .where(and(
          eq(adherenceLogs.patientId, p.id),
          eq(adherenceLogs.logDate, todayStr)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(adherenceLogs)
          .set({ status: true, responseText: Body, respondedAt: new Date() })
          .where(eq(adherenceLogs.id, existing[0].id));
        console.log('[Webhook] Updated existing adherence log → TAKEN');
      } else {
        await db.insert(adherenceLogs).values({
          patientId: p.id,
          logDate: todayStr,
          status: true,
          responseText: Body,
          respondedAt: new Date()
        });
        console.log('[Webhook] Inserted new adherence log → TAKEN');
      }

      await computeRisk(p.id);
      await checkAndAutoResolve(p.id);

      const successReply = lang === 'ka'
        ? 'ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಇಂದಿನ ಡೋಸ್ ದಾಖಲಾಗಿದೆ.'
        : 'Thank you! Your dose for today has been logged. Keep it up! 💊';
      console.log(`[Webhook] Replying: ${successReply}`);
      return res.send(`<Response><Message>${successReply}</Message></Response>`);
    }

    // ── Route 2: Opt-out ────────────────────────────────────────────────────
    if (bodyText === 'STOP') {
      console.log('[Webhook] → Route: OPT-OUT');
      await db.update(patients).set({ status: 'opted_out' }).where(eq(patients.id, p.id));
      const stopReply = lang === 'ka'
        ? 'ಚಂದಾದಾರಿಕೆಯನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.'
        : 'You have been opted out of reminders.';
      return res.send(`<Response><Message>${stopReply}</Message></Response>`);
    }

    // ── Route 3: Symptom survey reply (4 space-separated digits: "1 2 3 2") ─
    const parts = bodyText.split(/\s+/);
    console.log(`[Webhook] Checking symptom pattern: parts=${JSON.stringify(parts)}`);
    if (parts.length === 4 && parts.every((val: string) => ['1', '2', '3'].includes(val))) {
      console.log('[Webhook] → Route: SYMPTOM SURVEY');
      const answers = {
        vomiting: parts[0] === '1',
        yellow_eyes: parts[1] === '1',
        stomach_pain: parts[2] === '1' ? 'severe' : (parts[2] === '2' ? 'mild' : 'none'),
        appetite_loss: parts[3] === '1',
      } as const;

      console.log('[Webhook] Symptom answers:', answers);
      await processSymptomReply(p.id, answers);

      const surveySuccess = lang === 'ka'
        ? 'ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಲಕ್ಷಣಗಳ ಸಮೀಕ್ಷೆ ಪೂರ್ಣಗೊಂಡಿದೆ.'
        : 'Thank you! Your weekly symptom check-in has been logged.';
      console.log(`[Webhook] Replying: ${surveySuccess}`);
      return res.send(`<Response><Message>${surveySuccess}</Message></Response>`);
    }

    // ── Route 4: Q&A / LLM fallback ────────────────────────────────────────
    console.log(`[Webhook] → Route: Q&A LLM (condition: ${p.condition || 'TB'})`);
    const reply = await handlePatientQA(p.id, Body, lang, p.condition);
    console.log(`[Webhook] LLM reply: ${reply?.substring(0, 100)}...`);
    return res.send(`<Response><Message>${reply}</Message></Response>`);

  } catch (error) {
    console.error('[Webhook] ERROR:', error);
    return res.send('<Response><Message>An error occurred processing your request. Please try again.</Message></Response>');
  }
});

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Verification failed');
  }
});

router.post('/twilio/status', async (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode } = req.body;
  logger.info('[Webhook] Twilio status callback received', { MessageSid, MessageStatus, ErrorCode });

  if ((MessageStatus === 'failed' || MessageStatus === 'undelivered') && MessageSid) {
    try {
      const matchedReminders = await db.select().from(reminders).where(eq(reminders.externalId, MessageSid)).limit(1);
      if (matchedReminders.length > 0) {
        const rem = matchedReminders[0];
        if (rem.channel === 'whatsapp' && rem.status !== 'sms_fallback_sent') {
          const patientObj = await getPatientById(rem.patientId);
          if (patientObj) {
            console.log(`[SMS FALLBACK] Webhook detected WhatsApp failure for reminder ${rem.id} to ${patientObj.fullName}. Retrying via SMS...`);
            const smsPatient = { ...patientObj, channelPref: 'sms' };
            const { sid, status } = await sendTwilioMessage(smsPatient, rem.messageContent);

            await db.update(reminders).set({
              channel: 'sms',
              status: 'sms_fallback_sent',
              externalId: sid || rem.externalId,
            }).where(eq(reminders.id, rem.id));

            console.log(`[SMS FALLBACK SENT] Successfully sent SMS fallback. New SID: ${sid}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[SMS FALLBACK ERROR] Failed to perform SMS fallback in status webhook:', err);
    }
  }

  res.status(200).send('OK');
});

export default router;
