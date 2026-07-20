import crypto from 'crypto';

/**
 * Base32 character set helper to encode/decode TOTP secrets standard-style
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length: number = 16): string {
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += ALPHABET[bytes[i] % 32];
  }
  return secret;
}

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '');
  const len = clean.length;
  const buffer = Buffer.alloc(Math.floor((len * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < len; i++) {
    const val = ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return buffer;
}

/**
 * Computes standard RFC 6238 TOTP 6-digit code for a secret and time step counter
 */
export function generateTOTPCode(secret: string, counter: number): string {
  const key = base32ToBuffer(secret);
  
  // Counter represented as 8-byte big-endian integer buffer
  const buffer = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    buffer[i] = tmp & 0xff;
    tmp = tmp >> 8;
  }

  // Compute HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const hmacResult = hmac.digest();

  // Dynamic truncation
  const offset = hmacResult[hmacResult.length - 1] & 0xf;
  const codeInt =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  // Take modulo 10^6 to get 6 digit integer
  const code = codeInt % 1000000;
  return code.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with clock-drift verification support (allows window of +/- 1 step)
 */
export function verifyTOTP(secret: string, code: string, windowSteps: number = 1): boolean {
  if (!secret || !code) return false;
  
  const cleanCode = code.trim().replace(/\s/g, '');
  if (cleanCode.length !== 6 || isNaN(Number(cleanCode))) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let i = -windowSteps; i <= windowSteps; i++) {
    const calculated = generateTOTPCode(secret, currentCounter + i);
    if (calculated === cleanCode) {
      return true;
    }
  }

  return false;
}
