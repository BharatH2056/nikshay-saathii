import { pgTable, text, integer, boolean, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

export const healthWorkers = pgTable('health_workers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('hw'), // 'hw' | 'admin' | 'doctor'
  region: text('region'),
  isActive: boolean('is_active').default(true),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
  resetPasswordToken: text('reset_password_token'),
  resetPasswordExpires: timestamp('reset_password_expires'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const patients = pgTable('patients', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  nikshayId: text('nikshay_id'),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull().unique(),
  language: text('language').notNull().default('en'),
  condition: text('condition').notNull().default('TB'),
  regimenType: text('regimen_type').notNull().default('standard_6mo_dots'),
  treatmentStart: text('treatment_start').notNull(),
  treatmentDurationDays: integer('treatment_duration_days').notNull().default(180),
  status: text('status').notNull().default('active'),
  healthWorkerId: text('health_worker_id').references(() => healthWorkers.id),
  riskLevel: text('risk_level').notNull().default('green'),
  currentStreak: integer('current_streak').notNull().default(0),
  channelPref: text('channel_pref').notNull().default('whatsapp'),
  stickyNote: text('sticky_note'),
  medicationSupplyDays: integer('medication_supply_days').notNull().default(30),
  lastRefillDate: text('last_refill_date'),
  caregiverName: text('caregiver_name'),
  caregiverPhone: text('caregiver_phone'),
  caregiverRelation: text('caregiver_relation'),
  caregiverChannelPref: text('caregiver_channel_pref').default('whatsapp'),
  consentGiven: boolean('consent_given').default(false).notNull(),
  consentTimestamp: timestamp('consent_timestamp'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const reminders = pgTable('reminders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  sentAt: timestamp('sent_at'),
  channel: text('channel').notNull(),
  status: text('status').notNull().default('pending'),
  messageContent: text('message_content').notNull(),
  externalId: text('external_id'),
  acknowledged: boolean('acknowledged').notNull().default(false),
  acknowledgedAt: timestamp('acknowledged_at'),
  retryCount: integer('retry_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const adherenceLogs = pgTable('adherence_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  reminderId: text('reminder_id').references(() => reminders.id),
  logDate: text('log_date').notNull(),
  status: boolean('status').notNull(),
  responseText: text('response_text'),
  respondedAt: timestamp('responded_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  unique('patient_log_date_unique').on(t.patientId, t.logDate)
]);

export const symptomCheckins = pgTable('symptom_checkins', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  checkinDate: text('checkin_date').notNull(),
  responses: jsonb('responses').notNull(),
  severityScore: integer('severity_score').notNull().default(0),
  escalated: boolean('escalated').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const escalations = pgTable('escalations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  healthWorkerId: text('health_worker_id').references(() => healthWorkers.id).notNull(),
  type: text('type').notNull(), // 'MISSED_DOSES' | 'SYMPTOM_SEVERE' | 'REFILL_ALERT'
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'pending_doctor_review' | 'approved' | 'rejected' | 'acknowledged' | 'resolved' | 'auto_resolved'
  aiSummary: text('ai_summary'),
  aiSuggestedAction: text('ai_suggested_action'),
  guidelineCitations: jsonb('guideline_citations'),
  openedAt: timestamp('opened_at').defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at'),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: text('resolved_by').references(() => healthWorkers.id),
  reviewedBy: text('reviewed_by').references(() => healthWorkers.id),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),
});

export const qaSessions = pgTable('qa_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  messages: jsonb('messages').notNull().default([]),
  guardrailTriggered: boolean('guardrail_triggered').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const visits = pgTable('visits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  healthWorkerId: text('health_worker_id').references(() => healthWorkers.id).notNull(),
  visitedAt: timestamp('visited_at').defaultNow(),
  notes: text('notes'),
  followUpDate: text('follow_up_date'),
});

export const llmLogs = pgTable('llm_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  query: text('query').notNull(),
  response: text('response').notNull(),
  guardrailTriggered: integer('guardrail_triggered').notNull().default(0),
  model: text('model').notNull().default('mock-rag-kb'),
  latencyMs: integer('latency_ms').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  actorId: text('actor_id').references(() => healthWorkers.id).notNull(),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(), // 'VIEW_PATIENT' | 'EDIT_PATIENT' | 'DELETE_PATIENT' | 'CREATE_PATIENT'
  patientId: text('patient_id').references(() => patients.id),
  patientName: text('patient_name'),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});
