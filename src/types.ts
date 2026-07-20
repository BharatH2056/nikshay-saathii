import { z } from 'zod';

export const PatientSchema = z.object({
  id: z.string(),
  full_name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  language: z.enum(['en', 'ka']),
  condition: z.string().default('TB'),
  regimen_type: z.enum(['standard_6mo_dots']),
  treatment_start: z.coerce.date(),
  treatment_duration_days: z.number().int().positive().default(180),
  status: z.enum(['active', 'completed', 'dropped', 'opted_out']),
  risk_level: z.enum(['green', 'yellow', 'red']),
  current_streak: z.number().int().min(0),
  channel_pref: z.enum(['whatsapp', 'sms']),
  health_worker_id: z.string(),
  sticky_note: z.string().optional().nullable(),
  stickyNote: z.string().optional().nullable(),
  medication_supply_days: z.number().int().positive().optional().nullable(),
  medicationSupplyDays: z.number().int().positive().optional().nullable(),
  last_refill_date: z.string().optional().nullable(),
  lastRefillDate: z.string().optional().nullable(),
  caregiver_name: z.string().max(100).optional().nullable(),
  caregiverName: z.string().max(100).optional().nullable(),
  caregiver_phone: z.string().regex(/^\+91[6-9]\d{9}$/).optional().nullable(),
  caregiverPhone: z.string().regex(/^\+91[6-9]\d{9}$/).optional().nullable(),
  caregiver_relation: z.string().max(50).optional().nullable(),
  caregiverRelation: z.string().max(50).optional().nullable(),
  caregiver_channel_pref: z.enum(['whatsapp', 'sms']).optional().nullable(),
  caregiverChannelPref: z.enum(['whatsapp', 'sms']).optional().nullable(),
  consent_given: z.boolean().refine(val => val === true, {
    message: "Consent under India's DPDP Act is required to enroll patients.",
  }),
  consentGiven: z.boolean().optional(),
  consent_timestamp: z.coerce.date().optional(),
  consentTimestamp: z.coerce.date().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Patient = z.infer<typeof PatientSchema>;

export const AdherenceLogSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.boolean(),
  response_text: z.string().max(50).optional(),
  responded_at: z.coerce.date().optional(),
});

export type AdherenceLog = z.infer<typeof AdherenceLogSchema>;

export const SymptomResponseSchema = z.object({
  vomiting: z.boolean(),
  yellow_eyes: z.boolean(),
  stomach_pain: z.enum(['none', 'mild', 'severe']),
  appetite_loss: z.boolean(),
});

export type SymptomResponse = z.infer<typeof SymptomResponseSchema>;

export const SymptomCheckinSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  responses: SymptomResponseSchema,
  severity_score: z.number().int().min(0).max(4),
  escalated: z.boolean(),
});

export type SymptomCheckin = z.infer<typeof SymptomCheckinSchema>;
