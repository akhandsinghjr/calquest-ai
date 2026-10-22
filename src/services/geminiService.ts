import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { GoogleGenAI } from '@google/genai';
import type { GeminiMealAnalysis } from '../types';

const STORAGE_KEY_API = 'calquest_gemini_api_key';

/**
 * Prioritized cascade of multimodal vision models.
 * If gemini-3.8-flash returns 503 (High Demand / Overloaded) or 429,
 * the service automatically fails over to the next available model.
 */
const MODEL_FAILOVER_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

function sanitizeApiKey(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.replace(/[\s"'`]+/g, '').trim();
}

export function getStoredApiKey(): string {
  const localKey = sanitizeApiKey(localStorage.getItem(STORAGE_KEY_API));
  if (localKey) return localKey;
  const envKey = sanitizeApiKey(import.meta.env.VITE_GEMINI_API_KEY);
  return envKey;
}

export function setStoredApiKey(key: string): void {
  const cleaned = sanitizeApiKey(key);
  if (cleaned) {
    localStorage.setItem(STORAGE_KEY_API, cleaned);
  } else {
    localStorage.removeItem(STORAGE_KEY_API);
  }
}

export function hasBuiltInApiKey(): boolean {
  return Boolean(sanitizeApiKey(import.meta.env.VITE_GEMINI_API_KEY));
}

const MEAL_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    mealName: {
      type: 'string',
      description: 'Concise, appetizing name of the meal or drink detected in the photo.',
    },
    emoji: {
      type: 'string',
      description: 'Single food emoji representing the meal (e.g. 🥗, 🍛, 🍔, 🍳).',
    },
    totalCalories: {
      type: 'number',
      description: 'Total estimated calories (kcal) across all detected food items.',
    },
    macros: {
      type: 'object',
      properties: {
        proteinGrams: { type: 'number', description: 'Total protein in grams.' },
        carbsGrams: { type: 'number', description: 'Total carbohydrates in grams.' },
        fatGrams: { type: 'number', description: 'Total fat in grams.' },
        fiberGrams: { type: 'number', description: 'Total dietary fiber in grams.' },
      },
      required: ['proteinGrams', 'carbsGrams', 'fatGrams', 'fiberGrams'],
    },
    items: {
      type: 'array',
      description: 'Itemized breakdown of each distinct component on the plate or in the meal.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the individual food item.' },
          portionEstimate: {
            type: 'string',
            description: 'Estimated serving size or weight (e.g. "150g", "1 cup", "2 slices").',
          },
          calories: { type: 'number', description: 'Calories (kcal) for this item.' },
          proteinGrams: { type: 'number', description: 'Protein (g) for this item.' },
          carbsGrams: { type: 'number', description: 'Carbs (g) for this item.' },
          fatGrams: { type: 'number', description: 'Fat (g) for this item.' },
        },
        required: ['name', 'portionEstimate', 'calories', 'proteinGrams', 'carbsGrams', 'fatGrams'],
      },
    },
    healthScore: {
      type: 'number',
      description:
        'Nutritional quality score from 1 to 100 based on nutrient density, macro balance, whole ingredients, and processing level.',
    },
    wittyFeedback: {
      type: 'string',
      description:
        'Short, encouraging, gamified coach comment (1-2 sentences) praising good choices or giving a helpful nutrition tip.',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'Confidence level in visual portion and ingredient estimation.',
    },
  },
  required: [
    'mealName',
    'emoji',
    'totalCalories',
    'macros',
    'items',
    'healthScore',
    'wittyFeedback',
    'confidence',
  ],
};

function extractTextFromInteractionResponse(data: Record<string, unknown>): string | null {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const steps = data.steps as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(steps)) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (step?.type === 'model_output' && Array.isArray(step.content)) {
        const texts = (step.content as Array<Record<string, unknown>>)
          .filter((c) => c?.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text as string);
        if (texts.length > 0) {
          return texts.join('');
        }
      }
    }
  }
  const outputs = data.outputs as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(outputs) && outputs.length > 0) {
    const last = outputs[outputs.length - 1];
    if (typeof last?.text === 'string') return last.text;
  }
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const content = candidates[0]?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(parts)) {
      const textPart = parts.find((p) => typeof p?.text === 'string');
      if (typeof textPart?.text === 'string') return textPart.text;
    }
  }
  return null;
}

function isRetryableOverloadError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('500') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('high in demand') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('not found')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Primary call via Interactions API (/v1beta/interactions).
 */
async function callInteractionsSingleModel(
  apiKey: string,
  model: string,
  basePayload: Omit<Record<string, unknown>, 'model'>
): Promise<string> {
  const fullPayload = { ...basePayload, model };

  if (!Capacitor.isNativePlatform()) {
    try {
      const client = new GoogleGenAI({ apiKey });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interaction = await client.interactions.create(fullPayload as any);
      if (interaction.output_text) {
        return interaction.output_text;
      }
    } catch (sdkErr) {
      if (isRetryableOverloadError(sdkErr)) {
        throw sdkErr;
      }
    }
  }

  const res = await CapacitorHttp.post({
    url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    data: fullPayload,
  });

  const responseData =
    typeof res.data === 'string' ? JSON.parse(res.data) : (res.data as Record<string, unknown>);

  if (res.status < 200 || res.status >= 300) {
    const errObj = (responseData?.error as Record<string, unknown>) || responseData;
    const msg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      JSON.stringify(errObj) ||
      `HTTP ${res.status}`;
    throw new Error(`API Error (${res.status}) on ${model}: ${msg}`);
  }

  const outputText = extractTextFromInteractionResponse(responseData);
  if (!outputText) {
    throw new Error(`Empty response payload from ${model}.`);
  }
  return outputText;
}

/**
 * Secondary endpoint failover if /v1beta/interactions itself is returning 503.
 */
async function callModelsEndpointFailover(
  apiKey: string,
  model: string,
  promptText: string,
  base64Image?: string,
  mimeType?: string,
  jsonSchema?: Record<string, unknown>
): Promise<string> {
  const parts: Array<Record<string, unknown>> = [{ text: promptText }];
  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: base64Image,
      },
    });
  }

  const generationConfig: Record<string, unknown> = {};
  if (jsonSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = jsonSchema;
  }

  const res = await CapacitorHttp.post({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      contents: [{ role: 'user', parts }],
      generationConfig,
    },
  });

  const responseData =
    typeof res.data === 'string' ? JSON.parse(res.data) : (res.data as Record<string, unknown>);

  if (res.status < 200 || res.status >= 300) {
    const errObj = (responseData?.error as Record<string, unknown>) || responseData;
    const msg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      JSON.stringify(errObj) ||
      `HTTP ${res.status}`;
    throw new Error(`API Error (${res.status}) on ${model}: ${msg}`);
  }

  const outputText = extractTextFromInteractionResponse(responseData);
  if (!outputText) {
    throw new Error(`Empty response from ${model}.`);
  }
  return outputText;
}

/**
 * Queries the user's accessible Flash/Lite models dynamically when primary models return 503.
 */
async function discoverAvailableVisionModels(apiKey: string): Promise<string[]> {
  try {
    const res = await CapacitorHttp.get({
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    });
    if (res.status < 200 || res.status >= 300) return [];
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const models = Array.isArray(data?.models) ? data.models : [];
    const candidates: string[] = [];

    for (const m of models) {
      const rawName = typeof m?.name === 'string' ? m.name.replace(/^models\//, '') : '';
      const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods
        : [];
      if (
        rawName &&
        (rawName.includes('flash') || rawName.includes('gemma')) &&
        !rawName.includes('tts') &&
        !rawName.includes('image') &&
        !rawName.includes('live') &&
        !rawName.includes('embedding') &&
        (methods.length === 0 || methods.includes('generateContent'))
      ) {
        candidates.push(rawName);
      }
    }

    // Prioritize lite models first during high-demand 503 events since Lite pools have the most spare capacity
    candidates.sort((a, b) => {
      const aLite = a.includes('lite') ? 0 : 1;
      const bLite = b.includes('lite') ? 0 : 1;
      return aLite - bLite;
    });

    return candidates;
  } catch {
    return [];
  }
}

/**
 * Executes a request across the automatic model & endpoint failover chain.
 * If gemini-3.8-flash is experiencing 503 High Demand, it automatically routes
 * to Flash-Lite / alternate Flash models so the user never gets blocked by 503s.
 */
async function executeWithResilientFailover(params: {
  apiKey: string;
  basePayload: Omit<Record<string, unknown>, 'model'>;
  promptText: string;
  base64Image?: string;
  mimeType?: string;
  jsonSchema?: Record<string, unknown>;
}): Promise<{ text: string; modelUsed: string }> {
  let lastError: unknown = null;

  // Step 1: Try the primary Interactions API chain (gemini-3.8-flash -> gemini-3.5-flash-lite -> gemini-3.5-flash -> gemini-3.1-flash-lite)
  for (const model of MODEL_FAILOVER_CHAIN) {
    try {
      const text = await callInteractionsSingleModel(params.apiKey, model, params.basePayload);
      return { text, modelUsed: model };
    } catch (err) {
      lastError = err;
      if (!isRetryableOverloadError(err)) {
        throw err;
      }
      await sleep(250);
    }
  }

  // Step 2: Dynamically discover available Flash / Lite models on the server and try both endpoints
  const discoveredModels = await discoverAvailableVisionModels(params.apiKey);
  const allCandidates = Array.from(new Set([...MODEL_FAILOVER_CHAIN, ...discoveredModels]));

  for (const model of allCandidates) {
    try {
      const text = await callInteractionsSingleModel(params.apiKey, model, params.basePayload);
      return { text, modelUsed: model };
    } catch {
      // Try alternate endpoint if Interactions endpoint is 503 overloaded for this model
      try {
        const text = await callModelsEndpointFailover(
          params.apiKey,
          model,
          params.promptText,
          params.base64Image,
          params.mimeType,
          params.jsonSchema
        );
        return { text, modelUsed: model };
      } catch (err2) {
        lastError = err2;
      }
    }
    await sleep(300);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Service is temporarily experiencing high demand (503). Please tap again in a few seconds.');
}

export async function testGeminiConnection(overrideKey?: string): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
}> {
  const apiKey = sanitizeApiKey(overrideKey) || getStoredApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: 'No API key entered yet. Paste your key above first.',
      latencyMs: 0,
    };
  }

  const start = Date.now();
  try {
    const { modelUsed } = await executeWithResilientFailover({
      apiKey,
      basePayload: {
        input: 'Reply with the single word READY.',
      },
      promptText: 'Reply with the single word READY.',
    });
    return {
      ok: true,
      message: `Connected (${modelUsed})`,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

export async function analyzeFoodPhotoWithGemini(params: {
  base64Data: string;
  mimeType: string;
  userNote?: string;
  customInstruction?: string;
}): Promise<GeminiMealAnalysis> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Missing API Key. Please add your API key in the Settings tab first.');
  }

  const cleanBase64 = params.base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();

  const promptParts = [
    'You are CalQuest, an expert visual nutritionist and fitness coach.',
    'Analyze this food photo and calculate its calories and macronutrients accurately.',
    'Estimate realistic portion sizes using visual cues such as plate size, utensils, bowl depth, or packaging.',
    'Include hidden calories such as cooking oils, sauces, dressings, or butter where visually or culinarily typical.',
  ];

  if (params.customInstruction?.trim()) {
    promptParts.push(`Personal dietary context: ${params.customInstruction.trim()}`);
  }

  if (params.userNote?.trim()) {
    promptParts.push(`Note about this specific meal: ${params.userNote.trim()}`);
  }

  const promptText = promptParts.join('\n');

  const basePayload = {
    system_instruction:
      'You are CalQuest, an expert visual nutritionist and fitness coach. Break down every meal photo into accurate item-level calorie and macronutrient estimates and return strictly valid JSON matching the requested schema.',
    input: [
      {
        type: 'text' as const,
        text: promptText,
      },
      {
        type: 'image' as const,
        data: cleanBase64,
        mime_type: params.mimeType || 'image/jpeg',
      },
    ],
    response_format: {
      type: 'text' as const,
      mime_type: 'application/json',
      schema: MEAL_ANALYSIS_SCHEMA,
    },
  };

  const { text: rawText } = await executeWithResilientFailover({
    apiKey,
    basePayload,
    promptText,
    base64Image: cleanBase64,
    mimeType: params.mimeType || 'image/jpeg',
    jsonSchema: MEAL_ANALYSIS_SCHEMA,
  });

  const cleanedJson = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(cleanedJson) as GeminiMealAnalysis;

  const items = (parsed.items || []).map((item) => ({
    ...item,
    calories: Math.round(Number(item.calories) || 0),
    proteinGrams: Math.round(Number(item.proteinGrams) || 0),
    carbsGrams: Math.round(Number(item.carbsGrams) || 0),
    fatGrams: Math.round(Number(item.fatGrams) || 0),
    included: true,
  }));

  return {
    mealName: parsed.mealName || 'Scanned Meal',
    emoji: parsed.emoji || '🍽️',
    totalCalories: Math.round(Number(parsed.totalCalories) || 0),
    macros: {
      proteinGrams: Math.round(Number(parsed.macros?.proteinGrams) || 0),
      carbsGrams: Math.round(Number(parsed.macros?.carbsGrams) || 0),
      fatGrams: Math.round(Number(parsed.macros?.fatGrams) || 0),
      fiberGrams: Math.round(Number(parsed.macros?.fiberGrams) || 0),
    },
    items,
    healthScore: Math.max(1, Math.min(100, Math.round(Number(parsed.healthScore) || 70))),
    wittyFeedback:
      parsed.wittyFeedback || 'Great job logging your meal! Consistency is the ultimate superpower.',
    confidence: parsed.confidence || 'medium',
  };
}
