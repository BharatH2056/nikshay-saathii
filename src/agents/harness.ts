import { callHermesModel, HermesMessage } from './hermesClient';
import { tool } from '@langchain/core/tools';
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatResult } from '@langchain/core/outputs';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

import {
  getPatientAdherenceHistory,
  getTBKnowledgeBase,
  draftEscalationSummary,
  logRoutineQAInteraction,
} from './tools/patientTools';

import {
  summarizePatientCase,
  getTBGuidelineReference,
  draftTreatmentSuggestion,
} from './tools/doctorTools';

// Context Types
export type AgentContext = 'PATIENT_CONTEXT' | 'DOCTOR_CONTEXT';

export interface RunAgentOptions {
  context: AgentContext;
  messages: HermesMessage[];
  patientId?: string;
}

import { Runnable } from '@langchain/core/runnables';
import { BaseLanguageModelInput } from '@langchain/core/language_models/base';

// ---------------------------------------------------------------------------
// 1. Custom LangChain ChatModel wrapping callHermesModel() multi-provider fallback
// ---------------------------------------------------------------------------
export interface HermesChatModelParams extends BaseChatModelParams {
  temperature?: number;
}

import { RunnableLambda } from '@langchain/core/runnables';

export class HermesFallbackChatModel extends BaseChatModel {
  temperature: number;
  lastModelUsed: string = 'unknown';
  boundTools: any[] = [];

  constructor(fields?: HermesChatModelParams) {
    super(fields ?? {});
    this.temperature = fields?.temperature ?? 0.1;
  }

  _llmType(): string {
    return 'hermes_fallback_chat_model';
  }

  override bindTools(tools: any[], kwargs?: any): any {
    return RunnableLambda.from(async (input: any, options: any) => {
      const formattedInput = Array.isArray(input) ? input : (input.messages || []);
      const copy = new HermesFallbackChatModel({ temperature: this.temperature });
      copy.boundTools = tools;
      const res = await copy.invoke(formattedInput, options);
      return res;
    });
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions']
  ): Promise<ChatResult> {
    // Convert LangChain BaseMessages to HermesMessages
    const hermesMsgs: HermesMessage[] = messages.map(m => {
      const type = m._getType();
      if (type === 'human') return { role: 'user', content: String(m.content) };
      if (type === 'system') return { role: 'system', content: String(m.content) };
      if (type === 'ai') {
        const aiMsg = m as AIMessage;
        const toolCalls = aiMsg.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) }
        }));
        return {
          role: 'assistant',
          content: String(m.content),
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
        };
      }
      if (type === 'tool') {
        const toolMsg = m as ToolMessage;
        return {
          role: 'tool',
          name: toolMsg.name,
          tool_call_id: toolMsg.tool_call_id,
          content: String(m.content)
        };
      }
      return { role: 'user', content: String(m.content) };
    });

    // Convert bound tools to OpenAI function calling format if passed via options or bindTools
    const rawTools = (options as any)?.tools || this.boundTools;
    let formattedTools: any[] | undefined = undefined;

    if (rawTools && Array.isArray(rawTools) && rawTools.length > 0) {
      formattedTools = rawTools.map((t: any) => {
        if (t.type === 'function' && t.function) return t;
        if (t.name && t.description && t.schema) {
          return {
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: (t as any).schema?._def ? zodToJsonSchema(t.schema) : (t.parameters || {})
            }
          };
        }
        return t;
      });
    }

    const res = await callHermesModel(hermesMsgs, {
      temperature: this.temperature,
      tools: formattedTools
    });

    this.lastModelUsed = res.modelUsed;

    // Convert tool_calls back to LangChain AIMessage tool_calls format
    const lcToolCalls = res.tool_calls?.map((tc: any) => ({
      name: tc.function.name,
      args: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
      id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
      type: 'tool_call' as const
    }));

    const aiMessage = new AIMessage({
      content: res.content || '',
      tool_calls: lcToolCalls
    });

    return {
      generations: [{ text: res.content || '', message: aiMessage }]
    };
  }
}

// Simple Zod to JSON Schema converter for LangChain tools inside HermesFallbackChatModel
function zodToJsonSchema(schema: z.ZodType<any>): any {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(shape)) {
      const zVal = val as z.ZodType<any>;
      if (!zVal.isOptional()) required.push(key);
      properties[key] = zodToJsonSchema(zVal);
    }

    return { type: 'object', properties, required };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: (schema as any)._def.values };
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema((schema as any)._def.type) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as any)._def.innerType);
  }
  return { type: 'string' };
}

// ---------------------------------------------------------------------------
// 2. LangChain Tool Declarations (Wrapping existing tools with Zod schemas)
// ---------------------------------------------------------------------------

// Patient Tools (Strictly 4)
export const lcGetPatientAdherenceHistory = tool(
  async ({ patientId }: { patientId: string }) => {
    return await getPatientAdherenceHistory(patientId);
  },
  {
    name: 'getPatientAdherenceHistory',
    description: 'Fetch read-only 30-day medication adherence history for a specific patient.',
    schema: z.object({
      patientId: z.string().describe('Unique patient ID')
    })
  }
);

export const lcGetTBKnowledgeBase = tool(
  async ({ query }: { query: string }) => {
    return await getTBKnowledgeBase(query);
  },
  {
    name: 'getTBKnowledgeBase',
    description: 'Retrieve verified educational material regarding TB diet, side effects, and stigma.',
    schema: z.object({
      query: z.string().describe('Patient query or topic')
    })
  }
);

export const lcDraftEscalationSummary = tool(
  async (params) => {
    return await draftEscalationSummary(params);
  },
  {
    name: 'draftEscalationSummary',
    description: 'Draft a clinical escalation record with status pending_doctor_review for health worker/doctor attention.',
    schema: z.object({
      patientId: z.string(),
      type: z.enum(['MISSED_DOSES', 'SYMPTOM_SEVERE', 'REFILL_ALERT']),
      reason: z.string(),
      aiSummary: z.string(),
      aiSuggestedAction: z.string()
    })
  }
);

export const lcLogRoutineQAInteraction = tool(
  async (params) => {
    return await logRoutineQAInteraction(params);
  },
  {
    name: 'logRoutineQAInteraction',
    description: 'Record an audit log entry for a patient Q&A interaction.',
    schema: z.object({
      patientId: z.string(),
      query: z.string(),
      response: z.string(),
      guardrailTriggered: z.boolean(),
      model: z.string(),
      latencyMs: z.number()
    })
  }
);

// Doctor Tools (Strictly 3)
export const lcSummarizePatientCase = tool(
  async ({ patientId }: { patientId: string }) => {
    return await summarizePatientCase(patientId);
  },
  {
    name: 'summarizePatientCase',
    description: 'Consolidate 30-day adherence history, reported symptoms, escalations, and patient profile into a clinical summary.',
    schema: z.object({
      patientId: z.string().describe('Unique patient ID')
    })
  }
);

export const lcGetTBGuidelineReference = tool(
  async ({ query }: { query: string }) => {
    return await getTBGuidelineReference(query);
  },
  {
    name: 'getTBGuidelineReference',
    description: 'Query verified India NTEP & WHO TB guidelines for evidence-based management recommendations with explicit citations.',
    schema: z.object({
      query: z.string().describe('Clinical question or symptom query')
    })
  }
);

export const lcDraftTreatmentSuggestion = tool(
  async (params) => {
    return await draftTreatmentSuggestion(params);
  },
  {
    name: 'draftTreatmentSuggestion',
    description: 'Draft a clinical recommendation for doctor review. CANNOT modify prescription tables.',
    schema: z.object({
      patientId: z.string(),
      caseSummary: z.string(),
      guidelineCitations: z.array(z.object({
        guideline: z.string(),
        section: z.string(),
        title: z.string(),
        citation: z.string()
      })),
      suggestedAction: z.string()
    })
  }
);

// Enforce strict tool bindings
const patientTools = [
  lcGetPatientAdherenceHistory,
  lcGetTBKnowledgeBase,
  lcDraftEscalationSummary,
  lcLogRoutineQAInteraction
];

const doctorTools = [
  lcSummarizePatientCase,
  lcGetTBGuidelineReference,
  lcDraftTreatmentSuggestion
];

// ---------------------------------------------------------------------------
// 3. System Prompts (Verbatim Preserved)
// ---------------------------------------------------------------------------
const PATIENT_SYSTEM_PROMPT = `You are Nikshay Saathi Patient Support Assistant, powered by Hermes 4.
You assist patients with adherence tracking, TB education, and logging routine checkins.
CRITICAL SAFETY GUARDRAILS:
1. You must NEVER diagnose, prescribe medication, suggest changing doses, or advise stopping treatment.
2. You only have access to patient tools (adherence history, knowledge base, escalation drafting, and Q&A logging).
3. Always respond with empathy and clarity. Keep answers under 3 sentences.`;

const DOCTOR_SYSTEM_PROMPT = `You are Nikshay Saathi Clinical Decision Support Assistant, powered by Hermes 4.
You assist doctors by summarizing patient cases, searching official NTEP/WHO TB guidelines with exact citations, and drafting suggested next clinical actions.
CRITICAL SAFETY GUARDRAILS:
1. All generated clinical suggestions MUST be presented as drafts with status pending_doctor_review.
2. You CANNOT directly modify prescriptions, treatment regimens, or patient baseline records.
3. Every clinical recommendation must include explicit citations from official NTEP/WHO guidelines.`;

// ---------------------------------------------------------------------------
// 4. LangGraph Agent Instances via createReactAgent
// ---------------------------------------------------------------------------
const patientModel = new HermesFallbackChatModel({ temperature: 0.1 });
const doctorModel = new HermesFallbackChatModel({ temperature: 0.1 });

const patientAgent = createReactAgent({
  llm: patientModel,
  tools: patientTools,
  prompt: PATIENT_SYSTEM_PROMPT
});

const doctorAgent = createReactAgent({
  llm: doctorModel,
  tools: doctorTools,
  prompt: DOCTOR_SYSTEM_PROMPT
});

// Helper to map HermesMessage[] to LangChain BaseMessage[]
function convertMessagesToLangChain(messages: HermesMessage[]): BaseMessage[] {
  return messages
    .filter(m => m.role !== 'system') // system prompt is set in createReactAgent prompt
    .map(m => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      if (m.role === 'tool') {
        return new ToolMessage({
          content: m.content,
          tool_call_id: m.tool_call_id || '',
          name: m.name || ''
        });
      }
      return new HumanMessage(m.content);
    });
}

// ---------------------------------------------------------------------------
// 5. Exported Executors (preserves exact signature and return shape)
// ---------------------------------------------------------------------------

export async function runPatientAgent(messages: HermesMessage[], patientId?: string) {
  const inputMessages = convertMessagesToLangChain(messages);
  
  const result = await patientAgent.invoke({
    messages: inputMessages
  });

  const outputMessages = result.messages as BaseMessage[];
  const lastAiMessage = outputMessages.filter(m => m._getType() === 'ai').pop() as AIMessage | undefined;
  
  // Inspect tool messages to capture toolUsed and toolOutput
  const toolMessages = outputMessages.filter(m => m._getType() === 'tool') as ToolMessage[];
  let toolUsed: string | null = null;
  let toolOutput: any = null;

  if (toolMessages.length > 0) {
    const lastToolMsg = toolMessages[toolMessages.length - 1];
    toolUsed = lastToolMsg.name || null;
    try {
      toolOutput = JSON.parse(String(lastToolMsg.content));
    } catch {
      toolOutput = lastToolMsg.content;
    }
  }

  return {
    content: lastAiMessage ? String(lastAiMessage.content) : null,
    toolUsed,
    toolOutput,
    modelUsed: patientModel.lastModelUsed,
    context: 'PATIENT_CONTEXT' as AgentContext
  };
}

export async function runDoctorAgent(messages: HermesMessage[], patientId: string) {
  const inputMessages = convertMessagesToLangChain(messages);

  const result = await doctorAgent.invoke({
    messages: inputMessages
  });

  const outputMessages = result.messages as BaseMessage[];
  const lastAiMessage = outputMessages.filter(m => m._getType() === 'ai').pop() as AIMessage | undefined;

  const toolMessages = outputMessages.filter(m => m._getType() === 'tool') as ToolMessage[];
  let toolUsed: string | null = null;
  let toolOutput: any = null;

  if (toolMessages.length > 0) {
    const lastToolMsg = toolMessages[toolMessages.length - 1];
    toolUsed = lastToolMsg.name || null;
    try {
      toolOutput = JSON.parse(String(lastToolMsg.content));
    } catch {
      toolOutput = lastToolMsg.content;
    }
  }

  return {
    content: lastAiMessage ? String(lastAiMessage.content) : null,
    toolUsed,
    toolOutput,
    modelUsed: doctorModel.lastModelUsed,
    context: 'DOCTOR_CONTEXT' as AgentContext
  };
}

