import { db, schema } from '@/src/db';
import { eq, desc } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// 1. Tool: getPatientAdherenceHistory (Read-Only)
export async function getPatientAdherenceHistory(patientId: string) {
  try {
    const logs = await db
      .select()
      .from(schema.adherenceLogs)
      .where(eq(schema.adherenceLogs.patientId, patientId))
      .orderBy(desc(schema.adherenceLogs.logDate))
      .limit(30);

    const total = logs.length;
    const taken = logs.filter(l => l.status).length;
    const rate = total > 0 ? (taken / total) * 100 : 0;

    return {
      patientId,
      totalLoggedDays: total,
      dosesTaken: taken,
      dosesMissed: total - taken,
      adherenceRatePercentage: Math.round(rate),
      recentLogs: logs.slice(0, 10).map(l => ({
        date: l.logDate,
        taken: l.status,
        response: l.responseText
      }))
    };
  } catch (err: any) {
    return { error: `Failed to fetch adherence history: ${err.message}` };
  }
}

// 2. Tool: getTBKnowledgeBase (Retrieval over tb-education.json)
export async function getTBKnowledgeBase(query: string) {
  try {
    const kbPath = path.join(process.cwd(), 'src/knowledge/tb-education.json');
    const content = fs.readFileSync(kbPath, 'utf-8');
    const kb = JSON.parse(content);
    const queryLower = query.toLowerCase();

    const matches = kb.filter((item: any) =>
      item.keywords.some((k: string) => queryLower.includes(k)) ||
      item.question.toLowerCase().includes(queryLower) ||
      item.category.toLowerCase().includes(queryLower)
    );

    if (matches.length > 0) {
      return {
        query,
        matchCount: matches.length,
        results: matches.slice(0, 3).map((m: any) => ({
          question: m.question,
          answer: m.answer,
          category: m.category
        }))
      };
    }

    return {
      query,
      matchCount: 0,
      results: [],
      note: "No direct keyword match found. Reverting to general TB guidance."
    };
  } catch (err: any) {
    return { error: `Failed to query knowledge base: ${err.message}` };
  }
}

// 3. Tool: draftEscalationSummary (Draft Only - pending_doctor_review)
export async function draftEscalationSummary(params: {
  patientId: string;
  type: 'MISSED_DOSES' | 'SYMPTOM_SEVERE' | 'REFILL_ALERT';
  reason: string;
  aiSummary: string;
  aiSuggestedAction: string;
}) {
  try {
    // Find health worker for patient or assign default
    const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, params.patientId));
    const hwId = patient?.healthWorkerId || '11111111-1111-1111-1111-111111111111';

    const [newEscalation] = await db.insert(schema.escalations).values({
      patientId: params.patientId,
      healthWorkerId: hwId,
      type: params.type,
      reason: params.reason,
      status: 'pending_doctor_review',
      aiSummary: params.aiSummary,
      aiSuggestedAction: params.aiSuggestedAction,
      openedAt: new Date(),
    }).returning();

    return {
      success: true,
      escalationId: newEscalation.id,
      status: 'pending_doctor_review',
      message: 'Draft escalation submitted for doctor review. No external notification triggered.'
    };
  } catch (err: any) {
    return { error: `Failed to draft escalation summary: ${err.message}` };
  }
}

// 4. Tool: logRoutineQAInteraction (Audit Log Only)
export async function logRoutineQAInteraction(params: {
  patientId: string;
  query: string;
  response: string;
  guardrailTriggered: boolean;
  model: string;
  latencyMs: number;
}) {
  try {
    const [log] = await db.insert(schema.llmLogs).values({
      patientId: params.patientId,
      query: params.query,
      response: params.response,
      guardrailTriggered: params.guardrailTriggered ? 1 : 0,
      model: params.model,
      latencyMs: params.latencyMs,
      createdAt: new Date(),
    }).returning();

    return {
      success: true,
      logId: log.id,
      recordedAt: log.createdAt
    };
  } catch (err: any) {
    return { error: `Failed to log interaction: ${err.message}` };
  }
}

// Complete Patient Tools Allowlist Definitions for Hermes / LangChain function calling schema
export const PATIENT_TOOL_DEFINITIONS = [
  {
    name: 'getPatientAdherenceHistory',
    description: 'Fetch read-only 30-day medication adherence history for a specific patient.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'string', description: 'Unique patient ID' }
      },
      required: ['patientId']
    }
  },
  {
    name: 'getTBKnowledgeBase',
    description: 'Retrieve verified educational material regarding TB diet, side effects, and stigma.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Patient query or topic' }
      },
      required: ['query']
    }
  },
  {
    name: 'draftEscalationSummary',
    description: 'Draft a clinical escalation record with status pending_doctor_review for health worker/doctor attention.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'string' },
        type: { type: 'string', enum: ['MISSED_DOSES', 'SYMPTOM_SEVERE', 'REFILL_ALERT'] },
        reason: { type: 'string' },
        aiSummary: { type: 'string' },
        aiSuggestedAction: { type: 'string' }
      },
      required: ['patientId', 'type', 'reason', 'aiSummary', 'aiSuggestedAction']
    }
  },
  {
    name: 'logRoutineQAInteraction',
    description: 'Record an audit log entry for a patient Q&A interaction.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'string' },
        query: { type: 'string' },
        response: { type: 'string' },
        guardrailTriggered: { type: 'boolean' },
        model: { type: 'string' },
        latencyMs: { type: 'number' }
      },
      required: ['patientId', 'query', 'response', 'guardrailTriggered', 'model', 'latencyMs']
    }
  }
];
