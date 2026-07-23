import { db, schema } from '@/src/db';
import { eq, desc } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// 1. Tool: summarizePatientCase (Read-Only Case Aggregator for Doctor)
export async function summarizePatientCase(patientId: string) {
  try {
    const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, patientId));
    if (!patient) {
      return { error: `Patient ${patientId} not found.` };
    }

    const logs = await db
      .select()
      .from(schema.adherenceLogs)
      .where(eq(schema.adherenceLogs.patientId, patientId))
      .orderBy(desc(schema.adherenceLogs.logDate))
      .limit(30);

    const symptoms = await db
      .select()
      .from(schema.symptomCheckins)
      .where(eq(schema.symptomCheckins.patientId, patientId))
      .orderBy(desc(schema.symptomCheckins.createdAt))
      .limit(5);

    const priorEscalations = await db
      .select()
      .from(schema.escalations)
      .where(eq(schema.escalations.patientId, patientId))
      .orderBy(desc(schema.escalations.openedAt))
      .limit(5);

    const totalLogs = logs.length;
    const takenLogs = logs.filter(l => l.status).length;

    return {
      patient: {
        id: patient.id,
        name: patient.fullName,
        nikshayId: patient.nikshayId || 'N/A',
        regimenType: patient.regimenType,
        treatmentStart: patient.treatmentStart,
        riskLevel: patient.riskLevel,
        currentStreak: patient.currentStreak,
        medicationSupplyDays: patient.medicationSupplyDays,
        caregiver: patient.caregiverName ? `${patient.caregiverName} (${patient.caregiverRelation})` : 'None'
      },
      adherenceSummary: {
        last30DaysCount: totalLogs,
        dosesTaken: takenLogs,
        dosesMissed: totalLogs - takenLogs,
        adherenceRate: totalLogs > 0 ? `${Math.round((takenLogs / totalLogs) * 100)}%` : '0%'
      },
      recentSymptoms: symptoms.map(s => ({
        date: s.checkinDate,
        severityScore: s.severityScore,
        responses: s.responses
      })),
      priorEscalations: priorEscalations.map(e => ({
        id: e.id,
        type: e.type,
        reason: e.reason,
        status: e.status,
        openedAt: e.openedAt
      }))
    };
  } catch (err: any) {
    return { error: `Failed to summarize patient case: ${err.message}` };
  }
}

// 2. Tool: getTBGuidelineReference (RAG over versioned official-guidelines.json with Citations)
export async function getTBGuidelineReference(query: string) {
  try {
    const filePath = path.join(process.cwd(), 'src/knowledge/official-guidelines.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    
    const metadata = parsed._metadata;
    const guidelines = parsed.guidelines || [];
    const queryLower = query.toLowerCase();

    const matched = guidelines.filter((item: any) =>
      item.keywords.some((k: string) => queryLower.includes(k)) ||
      item.title.toLowerCase().includes(queryLower) ||
      item.content.toLowerCase().includes(queryLower) ||
      item.section.toLowerCase().includes(queryLower)
    );

    const results = (matched.length > 0 ? matched : guidelines.slice(0, 2)).map((g: any) => ({
      guideline: g.guideline,
      section: g.section,
      title: g.title,
      content: g.content,
      citation: g.citation
    }));

    return {
      corpusVersion: metadata.version,
      lastReviewedDate: metadata.last_reviewed_date,
      reviewedBy: metadata.reviewed_by,
      disclaimer: metadata.disclaimer,
      matchedCount: results.length,
      citations: results
    };
  } catch (err: any) {
    return { error: `Failed to retrieve guideline references: ${err.message}` };
  }
}

export type DraftResult =
  | {
      success: true;
      draftId: string;
      status: string;
      suggestedAction: string;
      citationsCount: number;
      guardrailNote: string;
    }
  | {
      success: false;
      error: string;
    };

// 3. Tool: draftTreatmentSuggestion (Draft Decision-Support Tool - Never mutates prescription table)
export async function draftTreatmentSuggestion(params: {
  patientId: string;
  caseSummary: string;
  guidelineCitations: Array<{ guideline: string; section: string; title: string; citation: string }>;
  suggestedAction: string;
}): Promise<DraftResult> {
  try {
    const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, params.patientId));
    const hwId = patient?.healthWorkerId || '11111111-1111-1111-1111-111111111111';

    const [draft] = await db.insert(schema.escalations).values({
      patientId: params.patientId,
      healthWorkerId: hwId,
      type: 'MISSED_DOSES',
      reason: `Clinical Decision Support Draft: ${params.suggestedAction.slice(0, 100)}...`,
      status: 'pending_doctor_review',
      aiSummary: params.caseSummary,
      aiSuggestedAction: params.suggestedAction,
      guidelineCitations: params.guidelineCitations,
      openedAt: new Date(),
    }).returning();

    return {
      success: true,
      draftId: draft.id,
      status: 'pending_doctor_review',
      suggestedAction: params.suggestedAction,
      citationsCount: params.guidelineCitations.length,
      guardrailNote: 'Suggestion created as a draft record requiring doctor approval. Prescription table was untouched.'
    };
  } catch (err: any) {
    // Never report a failed insert as a success. If the escalation row wasn't written,
    // status 'pending_doctor_review' is false — the draft does not exist in the queue.
    return { success: false, error: `Failed to create draft treatment suggestion: ${err.message}` };
  }
}

// Doctor Tools Allowlist Definitions for Hermes / LangChain function calling schema
export const DOCTOR_TOOL_DEFINITIONS = [
  {
    name: 'summarizePatientCase',
    description: 'Consolidate 30-day adherence history, reported symptoms, escalations, and patient profile into a clinical summary.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'string', description: 'Unique patient ID' }
      },
      required: ['patientId']
    }
  },
  {
    name: 'getTBGuidelineReference',
    description: 'Query verified India NTEP & WHO TB guidelines for evidence-based management recommendations with explicit citations.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Clinical question or symptom query' }
      },
      required: ['query']
    }
  },
  {
    name: 'draftTreatmentSuggestion',
    description: 'Draft a clinical recommendation for doctor review. CANNOT modify prescription tables.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'string' },
        caseSummary: { type: 'string' },
        guidelineCitations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              guideline: { type: 'string' },
              section: { type: 'string' },
              title: { type: 'string' },
              citation: { type: 'string' }
            }
          }
        },
        suggestedAction: { type: 'string' }
      },
      required: ['patientId', 'caseSummary', 'guidelineCitations', 'suggestedAction']
    }
  }
];
