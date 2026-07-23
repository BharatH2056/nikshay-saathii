import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

let _hermesClient: OpenAI | null | undefined = undefined;

function getHermesClient(): OpenAI | null {
  if (_hermesClient !== undefined) return _hermesClient;
  
  const baseURL = process.env.HERMES_API_BASE_URL;
  const apiKey = process.env.HERMES_API_KEY || 'hermes-local-key';

  if (baseURL && baseURL.trim() !== '') {
    console.log(`[Hermes 4 Client] Pointed at endpoint: ${baseURL}`);
    _hermesClient = new OpenAI({
      baseURL: baseURL,
      apiKey: apiKey,
    });
  } else {
    _hermesClient = null;
  }
  return _hermesClient;
}

let _geminiClient: GoogleGenAI | null | undefined = undefined;

function getGeminiClient(): GoogleGenAI | null {
  if (_geminiClient !== undefined) return _geminiClient;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim() !== '') {
    _geminiClient = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: { 'User-Agent': 'nikshay-saathi-hermes-fallback' }
      }
    });
  } else {
    _geminiClient = null;
  }
  return _geminiClient;
}

export interface HermesMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface HermesCompletionOptions {
  temperature?: number;
  tools?: any[];
  tool_choice?: any;
}

export interface HermesCompletionResult {
  content: string | null;
  tool_calls?: any[];
  modelUsed: string;
  fallbackUsed: boolean;
  toolCallingUnsupported?: boolean;
}

export async function callHermesModel(
  messages: HermesMessage[],
  options: HermesCompletionOptions = {}
): Promise<HermesCompletionResult> {
  const hermesClient = getHermesClient();
  const modelName = process.env.HERMES_MODEL_NAME || 'NousResearch/Hermes-4-14B';

  if (hermesClient) {
    try {
      const response = await hermesClient.chat.completions.create({
        model: modelName,
        messages: messages as any,
        temperature: options.temperature ?? 0.1,
        tools: options.tools,
        tool_choice: options.tool_choice,
      });

      const choice = response.choices[0];
      return {
        content: choice.message?.content || null,
        tool_calls: choice.message?.tool_calls as any,
        modelUsed: modelName,
        fallbackUsed: false,
      };
    } catch (error) {
      console.warn('[Hermes 4 Client] Call failed, invoking Gemini fallback:', error);
    }
  }

  // Fallback to Gemini if Hermes is unconfigured or failed
  const geminiClient = getGeminiClient();
  if (geminiClient) {
    try {
      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      
      // Convert OpenAI function tools format to Gemini tools format
      let geminiTools: any[] | undefined = undefined;
      if (options.tools && options.tools.length > 0) {
        const functionDeclarations = options.tools.map((t: any) => {
          const fn = t.function || t;
          return {
            name: fn.name,
            description: fn.description || '',
            parameters: fn.parameters || {}
          };
        });
        geminiTools = [{ functionDeclarations }];
      }

      // Convert messages list (including past tool turns) into Gemini contents or text representation
      // For simple multi-turn context or single prompt:
      const userMsgs = messages.filter(m => m.role === 'user' || m.role === 'tool').map(m => {
        if (m.role === 'tool') return `[Tool Response for ${m.name}]: ${m.content}`;
        return m.content;
      }).join('\n\n');

      const res = await geminiClient.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: userMsgs || 'Hello',
        config: {
          systemInstruction: systemMsg,
          temperature: options.temperature ?? 0.1,
          ...(geminiTools ? { tools: geminiTools } : {})
        }
      });

      // Map Gemini response functionCalls back to OpenAI tool_calls format
      const candidate = res.candidates?.[0];
      const functionCalls = res.functionCalls || candidate?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      let tool_calls: any[] | undefined = undefined;
      if (functionCalls && functionCalls.length > 0) {
        tool_calls = functionCalls.map((fc: any, index: number) => ({
          id: `call_gemini_${Date.now()}_${index}`,
          type: 'function',
          function: {
            name: fc.name,
            arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args || {})
          }
        }));
      }

      return {
        content: res.text || candidate?.content?.parts?.find((p: any) => p.text)?.text || null,
        tool_calls,
        modelUsed: 'gemini-3.5-flash (fallback)',
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      console.error('[Hermes 4 Client] Gemini fallback also failed:', fallbackError);
    }
  }

  // Fallback to deterministic mock
  const toolsRequested = !!(options.tools && options.tools.length > 0);
  return {
    content: 'Standard fallback response: Clinical assistant available in simulation mode.',
    tool_calls: undefined,
    modelUsed: toolsRequested
      ? 'deterministic-mock-fallback (tools unavailable)'
      : 'deterministic-mock-fallback',
    fallbackUsed: true,
    toolCallingUnsupported: toolsRequested ? true : undefined,
  };
}
