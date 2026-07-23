import { logger } from './logger';
import fs from 'fs';
import path from 'path';

let cachedSecrets: Record<string, string> | null = null;

function loadSecretsFromMount(): Record<string, string> {
  if (cachedSecrets) return cachedSecrets;

  const secrets: Record<string, string> = {};

  // Standard Secret Manager volume mount paths on Cloud Run / K8s
  const possiblePaths = [
    '/secrets/config.json',
    '/etc/secrets/config.json',
    path.join(process.cwd(), 'secrets.json')
  ];

  for (const mountPath of possiblePaths) {
    try {
      if (fs.existsSync(mountPath)) {
        const fileContent = fs.readFileSync(mountPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        logger.info(`[SECRETS] Successfully loaded secrets from secure volume mount: ${mountPath}`);
        Object.assign(secrets, parsed);
        cachedSecrets = secrets;
        return secrets;
      }
    } catch (err: any) {
      logger.debug(`Could not read mount path ${mountPath}: ${err.message}`);
    }
  }

  cachedSecrets = secrets;
  return secrets;
}

export function getSecret(key: string, fallbackValue: string = '', isRequiredInProd: boolean = false): string {
  // 1. Try mounting vault/secrets file first
  const mountedSecrets = loadSecretsFromMount();
  let value = mountedSecrets[key];

  // 2. Try standard environment variables if not in mounted secrets
  if (value === undefined) {
    const envVal = process.env[key];
    if (envVal !== undefined) {
      value = envVal;
    }
  }

  // 3. Enforce strict, fail-closed check if running in production and key falls back to insecure or is missing
  if (process.env.NODE_ENV === 'production') {
    const activeValue = value || fallbackValue;
    const isDefaultOrInsecure = 
      !activeValue ||
      (key === 'JWT_SECRET' && activeValue === 'nikshay_saathi_capstone_jwt_secret_64_character_long_key_development_only') ||
      (key === 'ENCRYPTION_KEY' && activeValue === 'd6F3E0a51D1a457492a348901a1d1d12') ||
      (key === 'TWILIO_ACCOUNT_SID' && (activeValue === 'AC30ae9b5484f6ec68434bf8a906bd3e03' || activeValue === 'AC0753a9b3c096f135b232f38e029fea77' || activeValue.startsWith('ACxx') || activeValue.startsWith('ACtesting') || activeValue.includes('xxxxxxxx') || activeValue.includes('your_'))) ||
      (key === 'TWILIO_AUTH_TOKEN' && (activeValue === '0d940d4c83dd5d131207edd7297d23f0' || activeValue.includes('xxxxxxxx') || activeValue.includes('your_')));

    if (isDefaultOrInsecure) {
      if (isRequiredInProd) {
        const errorMsg = `[SECURITY FATAL] Required production secret "${key}" is missing, insecure, or matches development defaults. Refusing to boot to ensure fail-closed security.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      } else {
        if (!value && !fallbackValue) {
          logger.warn(`[SECURITY ALERT] Production secret "${key}" is missing. System operations might be compromised.`);
        } else if (!value && fallbackValue) {
          logger.warn(`[SECURITY WARN] Production secret "${key}" is missing. Falling back to default value.`);
        }
      }
    }
  }

  return (value !== undefined && value !== null) ? value : (fallbackValue ?? '');
}
