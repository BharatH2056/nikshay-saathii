import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import crypto from 'crypto';

export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });
export { schema };

// Self-bootstrapping Seeder
export async function seedDatabase() {
  try {
    const checkSeed = await db.select().from(schema.healthWorkers).limit(1);
    if (checkSeed.length === 0) {
      console.log('[DATABASE] Seed required — bootstrapping health workers and patients in PostgreSQL...');
      
      const hwAnjaliId = '11111111-1111-1111-1111-111111111111';
      const hwMehtaId = '22222222-2222-2222-2222-222222222222';
      const PASSWORD_HASH = '$2b$10$q2tGGnW8BhDyvrfV/FLvMeP1upplHeIdgzl3HcvGhaqRnCGQXFnEq'; // for 'demo1234'

      // Seed Health Workers
      await db.insert(schema.healthWorkers).values([
        {
          id: hwAnjaliId,
          fullName: 'Anjali CHW',
          email: 'anjali@asha.in',
          phone: '+919876543210',
          passwordHash: PASSWORD_HASH,
          role: 'hw',
          region: 'Rural Karnataka (Zone A)',
          isActive: true,
        },
        {
          id: hwMehtaId,
          fullName: 'Dr. Mehta DTO',
          email: 'mehta@dots.in',
          phone: '+919876543211',
          passwordHash: PASSWORD_HASH,
          role: 'admin',
          region: 'Karnataka District Office',
          isActive: true,
        }
      ]);

      const patientData = [
        { id: '33333333-3333-3333-3333-333333333001', name: 'Ramesh K (Green)', phone: '+919800000001', language: 'ka', risk: 'green', streak: 12, rate: 0.95 },
        { id: '33333333-3333-3333-3333-333333333002', name: 'Suresh B (Green)', phone: '+919800000002', language: 'ka', risk: 'green', streak: 20, rate: 0.98 },
        { id: '33333333-3333-3333-3333-333333333003', name: 'Fatima M (Green)', phone: '+919800000003', language: 'en', risk: 'green', streak: 8, rate: 0.92 },
        
        { id: '33333333-3333-3333-3333-333333333004', name: 'Venkat R (Yellow)', phone: '+919800000004', language: 'ka', risk: 'yellow', streak: 0, rate: 0.75, forceMissToday: true },
        { id: '33333333-3333-3333-3333-333333333005', name: 'Meena D (Yellow)', phone: '+919800000005', language: 'ka', risk: 'yellow', streak: 3, rate: 0.70 },
        { id: '33333333-3333-3333-3333-333333333006', name: 'Gowra A (Yellow)', phone: '+919800000006', language: 'ka', risk: 'yellow', streak: 1, rate: 0.78 },
        { id: '33333333-3333-3333-3333-333333333007', name: 'Anand S (Yellow)', phone: '+919800000007', language: 'en', risk: 'yellow', streak: 2, rate: 0.72 },
        { id: '33333333-3333-3333-3333-333333333008', name: 'Radha P (Yellow)', phone: '+919800000008', language: 'ka', risk: 'yellow', streak: 0, rate: 0.65, forceMissToday: true },

        { id: '33333333-3333-3333-3333-333333333009', name: 'Priya S (Red)', phone: '+919800000009', language: 'ka', risk: 'red', streak: 0, rate: 0.40, forceMissLastDays: 3 },
        { id: '33333333-3333-3333-3333-333333333010', name: 'Karthik N (Red)', phone: '+919800000010', language: 'ka', risk: 'red', streak: 0, rate: 0.35, forceMissLastDays: 4 },
        { id: '33333333-3333-3333-3333-333333333011', name: 'Savitha J (Red)', phone: '+919800000011', language: 'ka', risk: 'red', streak: 0, rate: 0.45, forceMissLastDays: 2 },
        { id: '33333333-3333-3333-3333-333333333012', name: 'Deepak V (Red)', phone: '+919800000012', language: 'en', risk: 'red', streak: 0, rate: 0.30, forceMissLastDays: 5 },

        { id: '33333333-3333-3333-3333-333333333013', name: 'Shivaji R (Red + Severe)', phone: '+919800000013', language: 'ka', risk: 'red', streak: 0, rate: 0.25, forceMissLastDays: 2, severeSymptoms: true },
        { id: '33333333-3333-3333-3333-333333333014', name: 'Manjula K (Red + Severe)', phone: '+919800000014', language: 'ka', risk: 'red', streak: 0, rate: 0.40, forceMissLastDays: 3, severeSymptoms: true },
        { id: '33333333-3333-3333-3333-333333333015', name: 'Chethan H (Red + Severe)', phone: '+919800000015', language: 'en', risk: 'red', streak: 0, rate: 0.20, forceMissLastDays: 4, severeSymptoms: true },
      ];

      const today = new Date();

      for (const p of patientData) {
        const treatmentStart = new Date();
        treatmentStart.setDate(today.getDate() - 35);

        // Insert Patient
        await db.insert(schema.patients).values({
          id: p.id,
          fullName: p.name,
          phone: p.phone,
          language: p.language,
          regimenType: 'standard_6mo_dots',
          treatmentStart: treatmentStart.toISOString().split('T')[0],
          status: 'active',
          healthWorkerId: hwAnjaliId,
          riskLevel: p.risk,
          currentStreak: p.streak,
          channelPref: p.id.endsWith('3') || p.id.endsWith('7') ? 'sms' : 'whatsapp',
          caregiverName: p.risk === 'red' ? 'Rajesh K (Supporter)' : 'Family Caregiver',
          caregiverPhone: p.risk === 'red' ? '+919900000099' : '+919900000000',
          caregiverRelation: p.risk === 'red' ? 'Spouse' : 'Brother',
          caregiverChannelPref: 'whatsapp',
        });

        // Generate 30 days of historical logs
        const logs = [];
        for (let i = 30; i >= 0; i--) {
          const logDate = new Date();
          logDate.setDate(today.getDate() - i);
          const logDateStr = logDate.toISOString().split('T')[0];

          let taken = Math.random() < p.rate;

          if (p.forceMissToday && i === 0) {
            taken = false;
          }
          if (p.forceMissLastDays && i <= p.forceMissLastDays) {
            taken = false;
          }

          logs.push({
            id: crypto.randomUUID(),
            patientId: p.id,
            logDate: logDateStr,
            status: taken,
            responseText: taken ? (p.language === 'ka' ? 'ಹೌದು' : 'DONE') : null,
            respondedAt: taken ? new Date(logDate.setHours(9, 30, 0)) : null,
          });
        }

        await db.insert(schema.adherenceLogs).values(logs);

        // Severe symptoms check-in & escalations
        if (p.severeSymptoms) {
          const checkinDate = new Date();
          checkinDate.setDate(today.getDate() - 2);
          const checkinDateStr = checkinDate.toISOString().split('T')[0];

          await db.insert(schema.symptomCheckins).values({
            id: crypto.randomUUID(),
            patientId: p.id,
            checkinDate: checkinDateStr,
            responses: {
              vomiting: true,
              yellow_eyes: true,
              stomach_pain: 'severe',
              appetite_loss: true,
            },
            severityScore: 4,
            escalated: true,
          });

          await db.insert(schema.escalations).values({
            id: crypto.randomUUID(),
            patientId: p.id,
            healthWorkerId: hwAnjaliId,
            type: 'SYMPTOM_SEVERE',
            reason: 'Patient reported vomiting, yellow eyes, and severe stomach pain.',
            status: 'open',
            openedAt: new Date(checkinDate.setHours(10, 15, 0)),
          });
        }

        // Missed dose escalations
        if (p.risk === 'red' && !p.severeSymptoms) {
          const alertDate = new Date();
          alertDate.setDate(today.getDate() - (p.forceMissLastDays || 2));
          
          await db.insert(schema.escalations).values({
            id: crypto.randomUUID(),
            patientId: p.id,
            healthWorkerId: hwAnjaliId,
            type: 'MISSED_DOSES',
            reason: `Patient missed ${p.forceMissLastDays || 2} consecutive doses.`,
            status: 'open',
            openedAt: new Date(alertDate.setHours(8, 5, 0)),
          });
        }
      }
      console.log('[DATABASE] Seed complete! 15 Patients and 30 days history seeded successfully in PostgreSQL.');
    } else {
      console.log('[DATABASE] Existing health workers found — skipping database seed.');
    }
  } catch (err) {
    console.error('[DATABASE] Error during database seeding:', err);
  }
}
