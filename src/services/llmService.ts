import { db } from '@/src/db';
import { qaSessions, llmLogs } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// Lazy-initialized Gemini and Grok clients — must be called at request time, NOT at module load time.
import { GoogleGenAI } from '@google/genai';

let _geminiClient: GoogleGenAI | null | undefined = undefined;
function getGeminiClient(): GoogleGenAI | null {
  if (_geminiClient !== undefined) return _geminiClient;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== '') {
    console.log('[LLM] Gemini API key detected — using real gemini-3.5-flash model.');
    _geminiClient = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'nikshay-saathi',
        }
      }
    });
  } else {
    _geminiClient = null;
  }
  return _geminiClient;
}

let _openaiClient: OpenAI | null | undefined = undefined;
function getClient(): OpenAI | null {
  if (_openaiClient !== undefined) return _openaiClient;
  const grokKey = process.env.GROK_API_KEY || process.env.OPENAI_API_KEY;
  if (grokKey && grokKey !== '') {
    console.log('[LLM] Grok API key detected — using real grok-beta model.');
    _openaiClient = new OpenAI({
      apiKey: grokKey,
      baseURL: 'https://api.x.ai/v1',
    });
  } else {
    _openaiClient = null;
  }
  return _openaiClient;
}

// Load static Q&A context
const knowledgeBase = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src/knowledge/tb-education.json'), 'utf-8')
);

// Pre-format the full knowledge base for the LLM
const fullKnowledgeBaseText = knowledgeBase.map((item: any) => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n');

// Unsafe keywords that trigger override
const UNSAFE_KEYWORDS = [
  'diagnose', 'prescribe', 'stop medicine', 'skip medicine', 
  'double dose', 'change dose', 'alter medicine', 'stop treatment',
  'ಔಷಧಿ ನಿಲ್ಲಿಸು', 'ಚಿಕಿತ್ಸೆ ನಿಲ್ಲಿಸು'
];

const OVERRIDE_REPLY: Record<string, string> = {
  en: "Please contact your health worker or visit the nearest DOTS center. Never stop, skip, or alter your medication dosage without direct medical supervision.",
  ka: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆರೋಗ್ಯ ಕಾರ್ಯಕರ್ತರನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ ಹತ್ತಿರದ DOTS ಕೇಂದ್ರಕ್ಕೆ ಭೇಟಿ ನೀಡಿ. ವೈದ್ಯಕೀಯ ಮೇಲ್ವಿಚಾರಣೆಯಿಲ್ಲದೆ ನಿಮ್ಮ ಔಷಧಿ ಪ್ರಮಾಣವನ್ನು ಎಂದಿಗೂ ನಿಲ್ಲಿಸಬೇಡಿ ಅಥವಾ ಬದಲಾಯಿಸಬೇಡಿ."
};

const DEFAULT_REPLY: Record<string, string> = {
  en: "I am here to support your TB treatment. Please let me know if you have questions about your medication, diet, or side effects.",
  ka: "ನಿಮ್ಮ ಟಿಬಿ ಚಿಕಿತ್ಸೆಯನ್ನು ಬೆಂಬಲಿಸಲು ನಾನಿಲ್ಲಿದ್ದೇನೆ. ನಿಮ್ಮ ಔಷಧಿ, ಆಹಾರ ಅಥವಾ ಅಡ್ಡ ಪರಿಣಾಮಗಳ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ದಯವಿಟ್ಟು ನನಗೆ ತಿಳಿಸಿ."
};

function retrieveContextMock(query: string): string {
  const queryLower = query.toLowerCase();
  const matches = knowledgeBase.filter((item: any) => {
    return item.keywords.some((keyword: string) => queryLower.includes(keyword)) ||
           item.question.toLowerCase().includes(queryLower);
  });

  if (matches.length > 0) {
    return matches.slice(0, 3).map((m: any) => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n');
  }

  // Return empty string if no relevant context found in KB
  return "";
}

export async function handlePatientQA(patientId: string, query: string, language: 'en' | 'ka' = 'en', condition: string = 'TB') {
  const startTime = Date.now();
  let guardrailTriggered = false;
  let responseText = '';
  let modelNameUsed = 'mock-rag-kb';

  const queryLower = query.toLowerCase();
  const geminiClient = getGeminiClient();
  const client = getClient();

  const systemPrompt = `You are a ${condition} adherence assistant. You may only discuss diet, side-effect explanations, stigma support, and appointment reminders.
You MUST follow these rules:
1. Use the provided Knowledge Base to answer the user's questions contextually:
---
${fullKnowledgeBaseText}
---
2. GUARDRAIL: If the user asks about diagnosis, which specific medicine to take, medication changes, stopping medicine, or severe symptoms, YOU MUST refuse to answer and reply EXACTLY with this text: '${OVERRIDE_REPLY[language]}'
3. Never suggest stopping, skipping, or altering medication dosage.
4. Answer naturally and conversationally based on the user's intent. If the query is just a greeting or general statement, provide a supportive, brief response.
5. Reply in the user's language: ${language === 'ka' ? 'Kannada' : 'English'}. Keep responses short (under 2 sentences).`;

  if (geminiClient) {
    // 1. Primary AI Mode: Gemini 3.5 Flash
    try {
      modelNameUsed = 'gemini-3.5-flash';
      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: query,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
        }
      });
      responseText = response.text || DEFAULT_REPLY[language];
      if (responseText.includes(OVERRIDE_REPLY[language]) || queryLower.includes('stop medicine') || queryLower.includes('diagnose')) {
        guardrailTriggered = true;
      }
    } catch (err) {
      console.error('Gemini call failed, falling back to other methods:', err);
      // fallback to next block
      geminiClient && (_geminiClient = null); // disable client for this query
    }
  }

  // If Gemini is not used or failed, fall back to Grok or Mock
  if (!responseText) {
    if (client) {
      // 2. Secondary AI Mode: Grok-Beta
      try {
        modelNameUsed = 'grok-beta';
        const completion = await client.chat.completions.create({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: 0.1,
        });

        responseText = completion.choices[0].message?.content || DEFAULT_REPLY[language];
        
        if (responseText.includes(OVERRIDE_REPLY[language])) {
          guardrailTriggered = true;
        }
      } catch (err) {
        console.error('OpenAI call failed, falling back to static Q&A context:', err);
        const context = retrieveContextMock(query);
        responseText = context ? (context.split('\n')[1]?.replace('A: ', '') || OVERRIDE_REPLY[language]) : DEFAULT_REPLY[language];
      }
    } else {
      // 3. Tertiary Mock Mode: Rigid keyword matching
      modelNameUsed = 'mock-rag-kb';
      const isUnsafe = UNSAFE_KEYWORDS.some(k => queryLower.includes(k));
      
      if (isUnsafe) {
        guardrailTriggered = true;
        responseText = OVERRIDE_REPLY[language];
      } else {
        const matched = knowledgeBase.find((item: any) => {
          return item.keywords.some((keyword: string) => queryLower.includes(keyword));
        });
        responseText = matched ? matched.answer : DEFAULT_REPLY[language];
      }
    }
  }

  const latencyMs = Date.now() - startTime;

  // 4. Update or create QA session in DB
  let session = await db.select()
    .from(qaSessions)
    .where(eq(qaSessions.patientId, patientId))
    .orderBy(desc(qaSessions.createdAt))
    .limit(1);

  let sessionId = '';
  if (session.length === 0) {
    const [newSession] = await db.insert(qaSessions).values({
      patientId,
      messages: JSON.stringify([{ role: 'user', content: query }, { role: 'assistant', content: responseText }]),
      guardrailTriggered,
    }).returning();
    sessionId = newSession.id;
  } else {
    sessionId = session[0].id;
    const currentMessages = JSON.parse(JSON.stringify(session[0].messages));
    currentMessages.push({ role: 'user', content: query });
    currentMessages.push({ role: 'assistant', content: responseText });

    await db.update(qaSessions)
      .set({
        messages: JSON.stringify(currentMessages),
        guardrailTriggered: guardrailTriggered || session[0].guardrailTriggered,
        updatedAt: new Date(),
      })
      .where(eq(qaSessions.id, sessionId));
  }

  // 5. Log audit to llm_logs
  await db.insert(llmLogs).values({
    patientId,
    query,
    response: responseText,
    guardrailTriggered: guardrailTriggered ? 1 : 0,
    model: modelNameUsed,
    latencyMs,
  });

  return responseText;
}
