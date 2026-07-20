import { db } from '@/src/db';
import { patients } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { decryptPatient } from './crypto';

export async function getPatientById(patientId: string) {
  const results = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!results[0]) return null;
  return decryptPatient(results[0]);
}

export function getNormalizedLanguage(lang: string) {
  return (lang === 'ka' || lang === 'en') ? lang : 'en';
}

export function calculateMedicationDaysRemaining(treatmentStart: string, lastRefillDate: string | null, medicationSupplyDays: number): number {
  const refillStr = lastRefillDate || treatmentStart;
  if (!refillStr) return 0;
  
  const refill = new Date(refillStr);
  const today = new Date();
  
  refill.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - refill.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  const remaining = medicationSupplyDays - diffDays;
  return remaining < 0 ? 0 : remaining;
}

export function maskName(name: string | null | undefined): string {
  if (!name) return 'N/A';
  const parts = name.trim().split(/\s+/);
  return parts.map(part => {
    if (part.length <= 1) return part;
    if (part.length === 2) return part[0] + '*';
    return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
  }).join(' ');
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'N/A';
  const str = phone.trim();
  return str.replace(/.(?=.{4})/g, '*');
}

