import { Router, Response, NextFunction } from 'express';
import { db } from '@/src/db';
import { patients, healthWorkers, adherenceLogs, escalations, symptomCheckins, visits } from '@/src/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { PatientSchema } from '@/src/types';
import { z } from 'zod';
import { calculateMedicationDaysRemaining } from '../utils/patient';
import { logAudit } from '../utils/audit';
import { encrypt, decrypt, decryptPatient } from '../utils/crypto';
import { logger } from '../utils/logger';

const router = Router();

// Middleware to check patient access ownership
const checkPatientAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: No user session found' });
  }
  const { id } = req.params;
  try {
    const patientRecord = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    if (patientRecord.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    const patient = decryptPatient(patientRecord[0]);
    if (req.user.role !== 'admin' && patient.healthWorkerId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access or modify this patient\'s record' });
    }
    
    (req as any).patient = patient;
    next();
  } catch (error) {
    console.error('Check patient access error:', error);
    res.status(500).json({ error: 'Internal server error checking access' });
  }
};

const CreatePatientBody = PatientSchema.omit({
  id: true,
  status: true,
  risk_level: true,
  current_streak: true,
  created_at: true,
  updated_at: true,
});

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const { risk, hw_id, include_all } = req.query;

  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user session found' });
    }

    let queryConditions = [];
    if (include_all !== 'true') {
      queryConditions.push(eq(patients.status, 'active'));
    }
    if (risk) {
      queryConditions.push(eq(patients.riskLevel, risk as string));
    }
    
    // Enforce ownership check on search list if not an admin
    if (req.user.role !== 'admin') {
      queryConditions.push(eq(patients.healthWorkerId, req.user.id));
    } else if (hw_id) {
      queryConditions.push(eq(patients.healthWorkerId, hw_id as string));
    }

    const patientList = await db.select()
      .from(patients)
      .where(and(...queryConditions));

    const decryptedPatients = patientList.map(p => decryptPatient(p));

    // Sort: Red first, then Yellow, then Green. Within Red/Yellow sort by current streak ascending (worse first)
    const riskPriority = { red: 3, yellow: 2, green: 1 };
    decryptedPatients.sort((a, b) => {
      const aVal = riskPriority[a.riskLevel as 'red' | 'yellow' | 'green'] || 1;
      const bVal = riskPriority[b.riskLevel as 'red' | 'yellow' | 'green'] || 1;
      if (aVal !== bVal) return bVal - aVal;
      return a.currentStreak - b.currentStreak;
    });

    const mappedPatients = decryptedPatients.map(p => ({
      ...p,
      medicationDaysRemaining: calculateMedicationDaysRemaining(p.treatmentStart, p.lastRefillDate, p.medicationSupplyDays)
    }));

    res.json(mappedPatients);
  } catch (error) {
    console.error('Fetch patients error:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

router.get('/:id', authMiddleware, checkPatientAccess, async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const patient = (req as any).patient;
    const medicationDaysRemaining = calculateMedicationDaysRemaining(patient.treatmentStart, patient.lastRefillDate, patient.medicationSupplyDays);

    // Fetch recent 30 adherence logs
    const logs = await db.select()
      .from(adherenceLogs)
      .where(eq(adherenceLogs.patientId, id))
      .orderBy(desc(adherenceLogs.logDate))
      .limit(30);

    // Fetch escalations
    const escalationList = await db.select()
      .from(escalations)
      .where(eq(escalations.patientId, id))
      .orderBy(desc(escalations.openedAt));

    // Fetch symptom checkins
    const symptomList = await db.select()
      .from(symptomCheckins)
      .where(eq(symptomCheckins.patientId, id))
      .orderBy(desc(symptomCheckins.checkinDate));

    // Fetch visits
    const visitList = await db.select()
      .from(visits)
      .where(eq(visits.patientId, id))
      .orderBy(desc(visits.visitedAt));

    // Compute stats
    const totalDoses = logs.length;
    const takenDoses = logs.filter(l => l.status).length;
    const adherenceRate = totalDoses > 0 ? (takenDoses / totalDoses) * 100 : 100;

    // Log the view action
    if (req.user) {
      await logAudit(req.user, 'VIEW_PATIENT', patient.id, patient.fullName, 'Viewed patient details profile');
    }

    res.json({
      patient: {
        ...patient,
        medicationDaysRemaining
      },
      logs, // backward compatibility
      adherenceLogs: logs,
      escalations: escalationList,
      symptomCheckins: symptomList,
      visits: visitList,
      stats: {
        adherenceRate,
        totalDoses,
        takenDoses,
        missedDoses: totalDoses - takenDoses
      }
    });
  } catch (error) {
    console.error('Fetch patient detail error:', error);
    res.status(500).json({ error: 'Failed to fetch patient details' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const validated = CreatePatientBody.parse(req.body);

    // Check if phone number already exists by fetching all and comparing decrypted values
    const allPatients = await db.select().from(patients);
    const existing = allPatients.some(p => decrypt(p.phone) === validated.phone);
    if (existing) {
      return res.status(400).json({ error: 'A patient with this phone number is already enrolled' });
    }

    const caregiver_name = validated.caregiver_name || validated.caregiverName || req.body.caregiver_name || req.body.caregiverName || null;
    const caregiver_phone = validated.caregiver_phone || validated.caregiverPhone || req.body.caregiver_phone || req.body.caregiverPhone || null;
    const caregiver_relation = validated.caregiver_relation || validated.caregiverRelation || req.body.caregiver_relation || req.body.caregiverRelation || null;
    const caregiver_channel_pref = validated.caregiver_channel_pref || validated.caregiverChannelPref || req.body.caregiver_channel_pref || req.body.caregiverChannelPref || 'whatsapp';

    const [patient] = await db.insert(patients).values({
      fullName: encrypt(validated.full_name),
      phone: encrypt(validated.phone),
      language: validated.language,
      condition: validated.condition,
      regimenType: validated.regimen_type,
      treatmentStart: validated.treatment_start.toISOString().split('T')[0],
      treatmentDurationDays: validated.treatment_duration_days,
      healthWorkerId: validated.health_worker_id,
      channelPref: validated.channel_pref,
      medicationSupplyDays: req.body.medication_supply_days !== undefined ? Number(req.body.medication_supply_days) : 30,
      lastRefillDate: req.body.last_refill_date || validated.treatment_start.toISOString().split('T')[0],
      riskLevel: 'green',
      currentStreak: 0,
      status: 'active',
      caregiverName: caregiver_name ? encrypt(caregiver_name) : null,
      caregiverPhone: caregiver_phone ? encrypt(caregiver_phone) : null,
      caregiverRelation: caregiver_relation,
      caregiverChannelPref: caregiver_channel_pref,
      consentGiven: true,
      consentTimestamp: new Date()
    }).returning();

    const decryptedPatient = decryptPatient(patient);

    console.log(`[SIMULATED TWILIO] Sending welcome to ${decryptedPatient.fullName} (${decryptedPatient.phone}): "Welcome to Nikshay Saathi! We will help monitor your daily TB treatment progress."`);

    if (req.user) {
      await logAudit(req.user, 'CREATE_PATIENT', decryptedPatient.id, decryptedPatient.fullName, `Enrolled new patient`);
    }

    res.status(201).json(decryptedPatient);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Patient enrollment failed validation', { errors: error.issues, body: req.body });
      return res.status(400).json({ errors: error.issues });
    }
    logger.error('Enroll patient database error', error, { body: req.body });
    res.status(500).json({ error: 'Failed to enroll patient' });
  }
});

router.put('/:id', authMiddleware, checkPatientAccess, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const validated = CreatePatientBody.partial().parse(req.body);
    const updateValues: any = {};
    if (validated.full_name) updateValues.fullName = encrypt(validated.full_name);
    if (validated.phone) updateValues.phone = encrypt(validated.phone);
    if (validated.language) updateValues.language = validated.language;
    if (validated.channel_pref) updateValues.channelPref = validated.channel_pref;
    if (validated.health_worker_id) updateValues.healthWorkerId = validated.health_worker_id;
    if (validated.condition) updateValues.condition = validated.condition;
    if (validated.regimen_type) updateValues.regimenType = validated.regimen_type;
    if (validated.treatment_start) updateValues.treatmentStart = validated.treatment_start.toISOString().split('T')[0];
    if (validated.treatment_duration_days !== undefined) updateValues.treatmentDurationDays = validated.treatment_duration_days;
    if (req.body.medication_supply_days !== undefined) updateValues.medicationSupplyDays = Number(req.body.medication_supply_days);
    if (req.body.last_refill_date !== undefined) updateValues.lastRefillDate = req.body.last_refill_date;

    const caregiver_name = req.body.caregiver_name !== undefined ? req.body.caregiver_name : req.body.caregiverName;
    const caregiver_phone = req.body.caregiver_phone !== undefined ? req.body.caregiver_phone : req.body.caregiverPhone;
    const caregiver_relation = req.body.caregiver_relation !== undefined ? req.body.caregiver_relation : req.body.caregiverRelation;
    const caregiver_channel_pref = req.body.caregiver_channel_pref !== undefined ? req.body.caregiver_channel_pref : req.body.caregiverChannelPref;

    if (caregiver_name !== undefined) updateValues.caregiverName = caregiver_name ? encrypt(caregiver_name) : null;
    if (caregiver_phone !== undefined) updateValues.caregiverPhone = caregiver_phone ? encrypt(caregiver_phone) : null;
    if (caregiver_relation !== undefined) updateValues.caregiverRelation = caregiver_relation;
    if (caregiver_channel_pref !== undefined) updateValues.caregiverChannelPref = caregiver_channel_pref;

    const [updated] = await db.update(patients)
      .set({ ...updateValues, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const decryptedUpdated = decryptPatient(updated);

    if (req.user) {
      await logAudit(req.user, 'EDIT_PATIENT', id, decryptedUpdated.fullName, `Updated attributes: ${Object.keys(updateValues).join(', ')}`);
    }

    res.json(decryptedUpdated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

router.delete('/:id', authMiddleware, checkPatientAccess, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const [deleted] = await db.update(patients)
      .set({ status: 'opted_out', updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (req.user) {
      await logAudit(req.user, 'DELETE_PATIENT', id, deleted.fullName, 'Marked patient status as opted_out (deleted)');
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

router.put('/:id/sticky-note', authMiddleware, checkPatientAccess, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { stickyNote } = req.body;
  try {
    const [updated] = await db.update(patients)
      .set({ stickyNote: stickyNote ? encrypt(stickyNote) : null, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const decryptedUpdated = decryptPatient(updated);

    if (req.user) {
      await logAudit(req.user, 'EDIT_PATIENT_STICKY_NOTE', id, decryptedUpdated.fullName, 'Updated sticky note text');
    }

    res.json(decryptedUpdated);
  } catch (error) {
    console.error('Update sticky note error:', error);
    res.status(500).json({ error: 'Failed to update sticky note' });
  }
});

router.patch('/:id', authMiddleware, checkPatientAccess, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const { status } = req.body;
    if (!status || !['active', 'completed', 'opted_out'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [updated] = await db.update(patients)
      .set({ status, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const decryptedUpdated = decryptPatient(updated);

    if (req.user) {
      await logAudit(req.user, 'EDIT_PATIENT_STATUS', id, decryptedUpdated.fullName, `Updated status to: ${status}`);
    }

    res.json(decryptedUpdated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update patient status' });
  }
});

// POST /v1/patients/:id/refill — Record a new medication refill for the patient
router.post('/:id/refill', authMiddleware, checkPatientAccess, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { last_refill_date, medication_supply_days } = req.body;
  
  if (!last_refill_date || !medication_supply_days) {
    return res.status(400).json({ error: 'last_refill_date and medication_supply_days are required' });
  }

  try {
    const [updated] = await db.update(patients)
      .set({
        lastRefillDate: last_refill_date,
        medicationSupplyDays: Number(medication_supply_days),
        updatedAt: new Date()
      })
      .where(eq(patients.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const decryptedUpdated = decryptPatient(updated);

    if (req.user) {
      await logAudit(req.user, 'RECORD_PATIENT_REFILL', id, decryptedUpdated.fullName, `Refilled supply: ${medication_supply_days} days on date ${last_refill_date}`);
    }

    res.json(decryptedUpdated);
  } catch (error) {
    console.error('Record refill error:', error);
    res.status(500).json({ error: 'Failed to record medication refill' });
  }
});

// POST /v1/patients/import — Bulk patient CSV import (Admin-only)
router.post('/import', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required for bulk patient import' });
  }

  const { csvData } = req.body;
  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ error: 'csvData string is required' });
  }

  try {
    const lines = csvData.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must contain at least a header row and one data row' });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const results: Array<{ row: number; status: 'success' | 'error'; name?: string; error?: string }> = [];
    let successCount = 0;
    let failCount = 0;

    // Helper to get column index by name/alias
    const colIdx = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

    const fullNameIdx = colIdx('fullName') !== -1 ? colIdx('fullName') : colIdx('full_name');
    const phoneIdx = colIdx('phone');
    const languageIdx = colIdx('language');
    const conditionIdx = colIdx('condition');
    const regimenTypeIdx = colIdx('regimenType') !== -1 ? colIdx('regimenType') : colIdx('regimen_type');
    const treatmentStartIdx = colIdx('treatmentStart') !== -1 ? colIdx('treatmentStart') : colIdx('treatment_start');
    const treatmentDurationDaysIdx = colIdx('treatmentDurationDays') !== -1 ? colIdx('treatmentDurationDays') : colIdx('treatment_duration_days');
    const channelPrefIdx = colIdx('channelPref') !== -1 ? colIdx('channelPref') : colIdx('channel_pref');
    const medicationSupplyDaysIdx = colIdx('medicationSupplyDays') !== -1 ? colIdx('medicationSupplyDays') : colIdx('medication_supply_days');
    const caregiverNameIdx = colIdx('caregiverName') !== -1 ? colIdx('caregiverName') : colIdx('caregiver_name');
    const caregiverPhoneIdx = colIdx('caregiverPhone') !== -1 ? colIdx('caregiverPhone') : colIdx('caregiver_phone');
    const caregiverRelationIdx = colIdx('caregiverRelation') !== -1 ? colIdx('caregiverRelation') : colIdx('caregiver_relation');
    const caregiverChannelPrefIdx = colIdx('caregiverChannelPref') !== -1 ? colIdx('caregiverChannelPref') : colIdx('caregiver_channel_pref');
    const consentGivenIdx = colIdx('consentGiven') !== -1 ? colIdx('consentGiven') : colIdx('consent_given');

    if (fullNameIdx === -1 || phoneIdx === -1) {
      return res.status(400).json({ error: 'CSV must contain at least "fullName" (or "full_name") and "phone" columns' });
    }

    // Fetch existing patients to check duplicate phones
    const allPatients = await db.select().from(patients);
    const existingPhones = new Set(allPatients.map(p => decrypt(p.phone)));

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cells: string[] = [];
      let currentCell = '';
      let insideQuote = false;
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const char = line[charIdx];
        if (char === '"' || char === "'") {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));

      if (cells.length === 0 || (cells.length === 1 && cells[0] === '')) continue;

      const getVal = (idx: number, fallback = '') => (idx !== -1 && idx < cells.length ? cells[idx] : fallback);

      const rawName = getVal(fullNameIdx);
      const rawPhone = getVal(phoneIdx);
      const rawConsent = getVal(consentGivenIdx);

      if (!rawName) {
        results.push({ row: i + 1, status: 'error', error: 'Full Name is required' });
        failCount++;
        continue;
      }

      if (!rawPhone) {
        results.push({ row: i + 1, status: 'error', name: rawName, error: 'Phone Number is required' });
        failCount++;
        continue;
      }

      // Format & validate phone number (+91xxxxxxxxxx)
      let cleanPhone = rawPhone.trim();
      if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
        cleanPhone = `+${cleanPhone}`;
      } else if (cleanPhone.length === 10) {
        cleanPhone = `+91${cleanPhone}`;
      } else if (!cleanPhone.startsWith('+')) {
        cleanPhone = `+91${cleanPhone.replace(/\D/g, '')}`;
      }

      if (!/^\+91[6-9]\d{9}$/.test(cleanPhone)) {
        results.push({ row: i + 1, status: 'error', name: rawName, error: `Invalid Indian phone number: ${rawPhone}` });
        failCount++;
        continue;
      }

      if (existingPhones.has(cleanPhone)) {
        results.push({ row: i + 1, status: 'error', name: rawName, error: `A patient with phone number ${cleanPhone} is already enrolled` });
        failCount++;
        continue;
      }

      const consentUpper = rawConsent?.trim().toUpperCase();
      const hasConsent = consentUpper === 'TRUE' || consentUpper === 'YES' || consentUpper === '1';
      if (!hasConsent) {
        results.push({ row: i + 1, status: 'error', name: rawName, error: "Consent under India's DPDP Act is required (consentGiven column must be true/yes)" });
        failCount++;
        continue;
      }

      const language = (getVal(languageIdx, 'en').toLowerCase() === 'ka' || getVal(languageIdx, 'en').toLowerCase() === 'kn') ? 'ka' : 'en';
      const condition = getVal(conditionIdx, 'TB');
      const regimenType = getVal(regimenTypeIdx, 'standard_6mo_dots');
      
      let treatmentStart = getVal(treatmentStartIdx);
      if (!treatmentStart) {
        treatmentStart = new Date().toISOString().split('T')[0];
      } else {
        try {
          treatmentStart = new Date(treatmentStart).toISOString().split('T')[0];
        } catch {
          treatmentStart = new Date().toISOString().split('T')[0];
        }
      }

      const treatmentDurationDays = Number(getVal(treatmentDurationDaysIdx, '180')) || 180;
      const channelPref = getVal(channelPrefIdx, 'sms').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'sms';
      const medicationSupplyDays = Number(getVal(medicationSupplyDaysIdx, '30')) || 30;

      const caregiverName = getVal(caregiverNameIdx) || null;
      let caregiverPhone = getVal(caregiverPhoneIdx) || null;
      if (caregiverPhone) {
        let cleanCgPhone = caregiverPhone.trim();
        if (cleanCgPhone.startsWith('91') && cleanCgPhone.length === 12) {
          cleanCgPhone = `+${cleanCgPhone}`;
        } else if (cleanCgPhone.length === 10) {
          cleanCgPhone = `+91${cleanCgPhone}`;
        }
        caregiverPhone = /^\+91[6-9]\d{9}$/.test(cleanCgPhone) ? cleanCgPhone : null;
      }

      const caregiverRelation = getVal(caregiverRelationIdx) || null;
      const caregiverChannelPref = getVal(caregiverChannelPrefIdx, 'sms').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'sms';

      try {
        await db.insert(patients).values({
          fullName: encrypt(rawName),
          phone: encrypt(cleanPhone),
          language,
          condition,
          regimenType,
          treatmentStart,
          treatmentDurationDays,
          healthWorkerId: req.user.id,
          channelPref,
          medicationSupplyDays,
          lastRefillDate: treatmentStart,
          riskLevel: 'green',
          currentStreak: 0,
          status: 'active',
          caregiverName: caregiverName ? encrypt(caregiverName) : null,
          caregiverPhone: caregiverPhone ? encrypt(caregiverPhone) : null,
          caregiverRelation,
          caregiverChannelPref,
          consentGiven: true,
          consentTimestamp: new Date()
        });

        existingPhones.add(cleanPhone);
        results.push({ row: i + 1, status: 'success', name: rawName });
        successCount++;
      } catch (insertErr: any) {
        results.push({ row: i + 1, status: 'error', name: rawName, error: `Database insert failed: ${insertErr.message}` });
        failCount++;
      }
    }

    if (req.user && successCount > 0) {
      await logAudit(req.user, 'BULK_IMPORT_PATIENTS', 'BULK_IMPORT', 'SYSTEM', `Successfully bulk-imported ${successCount} patients from CSV (failures: ${failCount})`);
    }

    res.status(200).json({
      summary: {
        totalRows: lines.length - 1,
        successCount,
        failCount,
      },
      results
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    res.status(500).json({ error: `Failed to process bulk import: ${error.message}` });
  }
});

export default router;
