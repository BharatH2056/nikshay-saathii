import twilio from 'twilio';
import axios from 'axios';
import { getSecret } from './secrets';
import { maskName, maskPhone } from './patient';

let twilioClient: any = null;
let currentSid = '';
let currentToken = '';

export function getTwilioAccountSid(): string {
  const envSid = getSecret('TWILIO_ACCOUNT_SID', '', true);
  const envToken = getSecret('TWILIO_AUTH_TOKEN', '', true);

  const isEnvValid = envSid && envToken && 
                     !envSid.startsWith('ACxx') && 
                     !envSid.startsWith('ACtesting') && 
                     !envSid.includes('your_') && 
                     !envSid.includes('xxxxxxxx') &&
                     envSid !== 'AC0753a9b3c096f135b232f38e029fea77' &&
                     envSid !== 'AC30ae9b5484f6ec68434bf8a906bd3e03';

  if (isEnvValid) {
    return envSid;
  }

  return 'AC30ae9b5484f6ec68434bf8a906bd3e03';
}

export function getTwilioAuthToken(): string {
  const envSid = getSecret('TWILIO_ACCOUNT_SID', '', true);
  const envToken = getSecret('TWILIO_AUTH_TOKEN', '', true);

  const isEnvValid = envSid && envToken && 
                     !envSid.startsWith('ACxx') && 
                     !envSid.startsWith('ACtesting') && 
                     !envSid.includes('your_') && 
                     !envSid.includes('xxxxxxxx') &&
                     envSid !== 'AC0753a9b3c096f135b232f38e029fea77' &&
                     envSid !== 'AC30ae9b5484f6ec68434bf8a906bd3e03';

  if (isEnvValid) {
    return envToken;
  }

  return '0d940d4c83dd5d131207edd7297d23f0';
}

function getClient() {
  const accountSid = getTwilioAccountSid();
  const authToken = getTwilioAuthToken();

  if (accountSid !== currentSid || authToken !== currentToken) {
    currentSid = accountSid;
    currentToken = authToken;
    
    const isReal = accountSid && authToken && 
                   !accountSid.startsWith('ACxx') && 
                   !accountSid.startsWith('ACtesting') && 
                   !accountSid.includes('your_') && 
                   !accountSid.includes('xxxxxxxx') &&
                   accountSid !== 'AC30ae9b5484f6ec68434bf8a906bd3e03' &&
                   accountSid !== 'AC0753a9b3c096f135b232f38e029fea77';

    if (isReal) {
      try {
        twilioClient = twilio(accountSid, authToken);
        console.log(`[TWILIO] Initialized client dynamically with SID: ${accountSid}`);
      } catch (err: any) {
        console.error('[TWILIO] Failed to initialize client:', err?.message || err);
        twilioClient = null;
      }
    } else {
      twilioClient = null;
    }
  }
  return twilioClient;
}

function formatWhatsAppNumber(num: string): string {
  if (!num) return num;
  const cleaned = num.trim();
  if (cleaned.startsWith('whatsapp:')) return cleaned;
  return `whatsapp:${cleaned}`;
}

export async function sendTwilioMessage(patient: any, text: string) {
  const metaToken = getSecret('META_WHATSAPP_ACCESS_TOKEN', '', true);
  const metaPhoneId = getSecret('META_WHATSAPP_PHONE_NUMBER_ID', '', true);

  const maskedNameVal = maskName(patient.fullName || 'Patient');
  const maskedPhoneVal = maskPhone(patient.phone || '');

  // 1. Direct Meta WhatsApp Cloud API Integration
  if (patient.channelPref === 'whatsapp' && metaToken && metaPhoneId) {
    console.log(`[META WHATSAPP] Attempting to send WhatsApp message to ${maskedNameVal} via Meta Cloud API...`);
    try {
      const recipientPhone = patient.phone.replace('+', ''); // Meta format prefers digits without +
      const res = await axios.post(`https://graph.facebook.com/v17.0/${metaPhoneId}/messages`, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "text",
        text: { body: text }
      }, {
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json'
        }
      });
      const metaMsgId = res.data?.messages?.[0]?.id;
      console.log(`[META WHATSAPP SUCCESS] Message sent successfully via Meta. ID: ${metaMsgId}`);
      return { sid: metaMsgId || 'meta_success', status: 'sent' };
    } catch (metaErr: any) {
      const metaErrMsg = metaErr?.response?.data || metaErr.message;
      console.warn(`[META WHATSAPP FAIL] Failed to send via Meta Cloud API:`, JSON.stringify(metaErrMsg));
      
      // Fallback immediately to Twilio SMS if client and Twilio phone are configured
      console.log(`[META FALLBACK] Attempting immediate SMS fallback via Twilio due to Meta API failure...`);
      const client = getClient();
      const twilioNumber = (getSecret('TWILIO_PHONE_NUMBER') || '+919876543210').trim();
      if (client && twilioNumber) {
        try {
          const smsMessage = await client.messages.create({
            body: text,
            from: twilioNumber,
            to: patient.phone,
          });
          console.log(`[META FALLBACK SUCCESS] Twilio SMS fallback succeeded. SID: ${smsMessage.sid}`);
          return { sid: smsMessage.sid, status: 'sms_fallback_sent' };
        } catch (smsErr: any) {
          console.error(`[META FALLBACK FAIL] SMS fallback also failed:`, smsErr?.message || smsErr);
        }
      }
      return { sid: null, status: 'failed' };
    }
  }

  // 2. Twilio (WhatsApp / SMS) Integration
  const client = getClient();
  const twilioNumber = (getSecret('TWILIO_PHONE_NUMBER') || '+919876543210').trim();
  const from = patient.channelPref === 'whatsapp' ? formatWhatsAppNumber(twilioNumber) : twilioNumber;
  const to = patient.channelPref === 'whatsapp' ? formatWhatsAppNumber(patient.phone) : patient.phone;
  const maskedTo = to.replace(/.(?=.{4})/g, '*');

  if (!client) {
    console.log(`[SIMULATION] Message dispatch to ${maskedNameVal} (${maskedPhoneVal}) via ${patient.channelPref}: "${text}"`);
    return { sid: `sim_${Math.random().toString(36).substr(2, 9)}`, status: 'sent' };
  }

  try {
    console.log(`[TWILIO] Attempting to send message to ${maskedTo} from ${from}...`);
    const message = await client.messages.create({
      body: text,
      from,
      to,
    });
    console.log(`[TWILIO] Message successfully sent! SID: ${message.sid}`);
    return { sid: message.sid, status: 'sent' };
  } catch (e: any) {
    const errorMsg = e?.message || String(e);
    console.warn(`[TWILIO FAIL] Failed to send message to ${maskedTo}: ${errorMsg}.`);

    // Immediate fallback logic inside sendTwilioMessage if channelPref was whatsapp
    if (patient.channelPref === 'whatsapp') {
      console.log(`[TWILIO FALLBACK] Initial WhatsApp send failed. Retrying immediately via standard SMS...`);
      try {
        const smsMessage = await client.messages.create({
          body: text,
          from: twilioNumber,
          to: patient.phone,
        });
        console.log(`[TWILIO FALLBACK SUCCESS] Successfully sent SMS fallback. SID: ${smsMessage.sid}`);
        return { sid: smsMessage.sid, status: 'sms_fallback_sent' };
      } catch (smsErr: any) {
        console.error(`[TWILIO FALLBACK FAIL] SMS fallback also failed:`, smsErr?.message || smsErr);
      }
    }

    return { sid: null, status: 'failed' };
  }
}

export { twilioClient };
