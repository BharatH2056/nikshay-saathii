import crypto from 'crypto';
import { getSecret } from './secrets';

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = getSecret('ENCRYPTION_KEY', 'd6F3E0a51D1a457492a348901a1d1d12', true);

export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(12); // GCM standard IV length is 12 bytes
    const keyBuf = Buffer.alloc(32);
    keyBuf.write(ENCRYPTION_KEY, 'utf-8');
    
    const cipher = crypto.createCipheriv(GCM_ALGORITHM, keyBuf, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error('Encryption failed:', err);
    return text;
  }
}

export function decrypt(text: string): string {
  if (!text) return '';
  if (!text.includes(':')) {
    return text;
  }
  try {
    const textParts = text.split(':');
    const keyBuf = Buffer.alloc(32);
    keyBuf.write(ENCRYPTION_KEY, 'utf-8');

    if (textParts.length === 3) {
      // AES-256-GCM format: iv : authTag : ciphertext
      const iv = Buffer.from(textParts[0], 'hex');
      const authTag = Buffer.from(textParts[1], 'hex');
      const encryptedText = Buffer.from(textParts[2], 'hex');

      const decipher = crypto.createDecipheriv(GCM_ALGORITHM, keyBuf, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } else {
      // Fallback to legacy AES-256-CBC format: iv : ciphertext
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');

      const decipher = crypto.createDecipheriv(CBC_ALGORITHM, keyBuf, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }
  } catch (err) {
    // Graceful fallback to raw text if decryption fails
    return text;
  }
}

export function decryptPatient(patient: any) {
  if (!patient) return patient;
  return {
    ...patient,
    fullName: decrypt(patient.fullName),
    phone: decrypt(patient.phone),
    stickyNote: patient.stickyNote ? decrypt(patient.stickyNote) : patient.stickyNote,
    caregiverName: patient.caregiverName ? decrypt(patient.caregiverName) : patient.caregiverName,
    caregiverPhone: patient.caregiverPhone ? decrypt(patient.caregiverPhone) : patient.caregiverPhone,
  };
}
