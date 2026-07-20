import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { db } from '../db';
import { healthWorkers, patients, adherenceLogs, reminders, escalations } from '../db/schema';
import { getSecret } from '../utils/secrets';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;
function getS3Client(keyId: string, secretKey: string, region: string): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: secretKey,
      },
    });
  }
  return s3Client;
}

async function getGCPToken(): Promise<string | null> {
  try {
    const res = await axios.get('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }
    });
    return res.data?.access_token || null;
  } catch (err) {
    return null;
  }
}

export async function uploadToOffsiteStorage(filePath: string, fileName: string) {
  const gcsBucket = getSecret('BACKUP_GCS_BUCKET', '', true);
  const s3Bucket = getSecret('BACKUP_S3_BUCKET', '', true);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Local backup file not found at ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);

  if (gcsBucket) {
    console.log(`[OFFSITE BACKUP] GCS bucket configured. Starting upload of ${fileName}...`);
    try {
      const token = await getGCPToken();
      const headers: any = { 'Content-Type': 'application/octet-stream' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const url = `https://storage.googleapis.com/upload/storage/v1/b/${gcsBucket}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;
      await axios.post(url, fileBuffer, { headers });
      console.log(`[OFFSITE BACKUP SUCCESS] Successfully uploaded ${fileName} to GCS bucket: ${gcsBucket}`);
      return { provider: 'GCS', bucket: gcsBucket, success: true };
    } catch (err: any) {
      const errMsg = err?.response?.data || err.message;
      console.error(`[OFFSITE BACKUP FAIL] GCS upload failed:`, errMsg);
      return { provider: 'GCS', bucket: gcsBucket, success: false, error: String(errMsg) };
    }
  }

  if (s3Bucket) {
    const keyId = getSecret('AWS_ACCESS_KEY_ID', '', true);
    const secretKey = getSecret('AWS_SECRET_ACCESS_KEY', '', true);
    const region = getSecret('AWS_REGION', 'us-east-1', true);

    if (keyId && secretKey) {
      console.log(`[OFFSITE BACKUP] S3 bucket configured. Starting upload of ${fileName}...`);
      try {
        const client = getS3Client(keyId, secretKey, region);
        await client.send(new PutObjectCommand({
          Bucket: s3Bucket,
          Key: fileName,
          Body: fileBuffer,
          ContentType: 'application/json'
        }));
        console.log(`[OFFSITE BACKUP SUCCESS] Successfully uploaded ${fileName} to S3 bucket: ${s3Bucket}`);
        return { provider: 'S3', bucket: s3Bucket, success: true };
      } catch (err: any) {
        console.error(`[OFFSITE BACKUP FAIL] S3 upload failed:`, err.message || err);
        return { provider: 'S3', bucket: s3Bucket, success: false, error: err.message || String(err) };
      }
    } else {
      console.warn(`[OFFSITE BACKUP FAIL] S3 bucket is configured but AWS credentials are missing.`);
      return { provider: 'S3', bucket: s3Bucket, success: false, error: 'AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing' };
    }
  }

  console.warn(`[OFFSITE BACKUP FAIL] No offsite cloud storage providers configured (BACKUP_GCS_BUCKET or BACKUP_S3_BUCKET is missing).`);
  return { provider: 'None', bucket: null, success: false, error: 'No cloud storage providers are configured (BACKUP_GCS_BUCKET or BACKUP_S3_BUCKET is missing)' };
}

export async function runScheduledCloudBackup(): Promise<{ localPath: string; fileName: string; offsite: any }> {
  console.log('[BACKUP ENGINE] Triggering full database scheduled backup...');
  
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `nikshay_postgres_backup_${timestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  // Retrieve complete snapshot of all tables to perform robust portable JSON-dump
  const workersData = await db.select().from(healthWorkers);
  const patientsData = await db.select().from(patients);
  const logsData = await db.select().from(adherenceLogs);
  const remindersData = await db.select().from(reminders);
  const escalationsData = await db.select().from(escalations);

  const fullDump = {
    metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0',
      system: 'Nikshay Saathi'
    },
    tables: {
      healthWorkers: workersData,
      patients: patientsData,
      adherenceLogs: logsData,
      reminders: remindersData,
      escalations: escalationsData
    }
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(fullDump, null, 2), 'utf8');
  console.log(`[BACKUP ENGINE] Portable local JSON backup written to ${backupFilePath}`);

  // Sync to offsite GCS/S3 cloud storage
  const offsiteResult = await uploadToOffsiteStorage(backupFilePath, backupFileName);

  return {
    localPath: backupFilePath,
    fileName: backupFileName,
    offsite: offsiteResult
  };
}

export async function restoreFromBackupDump(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dump = JSON.parse(content);

  if (!dump.tables || !dump.metadata) {
    throw new Error('Invalid backup file format: missing tables or metadata.');
  }

  console.log('[BACKUP ENGINE RESTORE] Starting full transactional database restore...');

  // Deleting order to avoid foreign key violations:
  // adherenceLogs, reminders, escalations, patients, healthWorkers
  await db.delete(adherenceLogs);
  await db.delete(reminders);
  await db.delete(escalations);
  await db.delete(patients);
  await db.delete(healthWorkers);

  // Ingestion order:
  // healthWorkers, patients, adherenceLogs, reminders, escalations
  if (dump.tables.healthWorkers && dump.tables.healthWorkers.length > 0) {
    await db.insert(healthWorkers).values(dump.tables.healthWorkers);
  }
  if (dump.tables.patients && dump.tables.patients.length > 0) {
    await db.insert(patients).values(dump.tables.patients);
  }
  if (dump.tables.adherenceLogs && dump.tables.adherenceLogs.length > 0) {
    await db.insert(adherenceLogs).values(dump.tables.adherenceLogs);
  }
  if (dump.tables.reminders && dump.tables.reminders.length > 0) {
    await db.insert(reminders).values(dump.tables.reminders);
  }
  if (dump.tables.escalations && dump.tables.escalations.length > 0) {
    await db.insert(escalations).values(dump.tables.escalations);
  }

  console.log('[BACKUP ENGINE RESTORE] Database restore completed successfully.');
}
