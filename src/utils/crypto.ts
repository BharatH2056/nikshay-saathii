import crypto from 'crypto';
import { getSecret } from './secrets';

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
// Derive a 32-byte key using PBKDF2 to prevent key-length vulnerability / silent zero-padding
const RAW_KEY = getSecret('ENCRYPTION_KEY', 'd6F3E0a51D1a457492a348901a1d1d12', true);
const DERIVED_KEY = crypto.pbkdf2Sync(RAW_KEY, 'nikshay_salt_v1', 10000, 32, 'sha256');

export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(12); // GCM standard IV length is 12 bytes
    
    const cipher = crypto.createCipheriv(GCM_ALGORITHM, DERIVED_KEY, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error(`Encryption failed: ${(err as Error).message}`);
  }
}

export function decrypt(text: string): string {
  if (!text) return '';
  if (!text.includes(':')) {
    return text;
  }
  try {
    const textParts = text.split(':');

    if (textParts.length === 3) {
      // AES-256-GCM format: iv : authTag : ciphertext
      const iv = Buffer.from(textParts[0], 'hex');
      const authTag = Buffer.from(textParts[1], 'hex');
      const encryptedText = Buffer.from(textParts[2], 'hex');

      const decipher = crypto.createDecipheriv(GCM_ALGORITHM, DERIVED_KEY, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } else {
      // Fallback to legacy AES-256-CBC format: iv : ciphertext
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');

      const decipher = crypto.createDecipheriv(CBC_ALGORITHM, DERIVED_KEY, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }
  } catch (err) {
    console.error('Decryption failed:', err);
    throw new Error(`Decryption failed: ${(err as Error).message}`);
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
