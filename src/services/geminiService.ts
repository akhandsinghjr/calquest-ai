import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { GoogleGenAI } from '@google/genai';
import type { GeminiMealAnalysis } from '../types';

const STORAGE_KEY_API = 'calquest_gemini_api_key';

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
  return null;
}

/**
 * Native Android HTTP bridge fallback using CapacitorHttp.
 * Bypasses Android WebView CORS restrictions that cause "TypeError: Failed to fetch".
 */
async function callInteractionsViaNativeHttp(
  apiKey: string,
  payload: Record<string, unknown>
): Promise<string> {
  const res = await CapacitorHttp.post({
    url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    data: payload,
  });

  const responseData =
    typeof res.data === 'string' ? JSON.parse(res.data) : (res.data as Record<string, unknown>);

  if (res.status < 200 || res.status >= 300) {
    const errObj = (responseData?.error as Record<string, unknown>) || responseData;
    const msg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      JSON.stringify(errObj) ||
      `HTTP ${res.status}`;
    throw new Error(`API Error (${res.status}): ${msg}`);
  }

  const outputText = extractTextFromInteractionResponse(responseData);
  if (!outputText) {
    throw new Error('Model returned an empty response payload.');
  }
  return outputText;
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
  const payload = {
    model: 'gemini-3.8-flash',
    input: 'Reply with the single word READY.',
  };

  try {
    if (Capacitor.isNativePlatform()) {
      const text = await callInteractionsViaNativeHttp(apiKey, payload);
      return {
        ok: true,
        message: `Connected (${text.slice(0, 24).trim()})`,
        latencyMs: Date.now() - start,
      };
    }

    const client = new GoogleGenAI({ apiKey });
    const interaction = await client.interactions.create(payload);
    return {
      ok: true,
      message: `Connected (${(interaction.output_text || 'OK').slice(0, 24).trim()})`,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    try {
      const text = await callInteractionsViaNativeHttp(apiKey, payload);
      return {
        ok: true,
        message: `Connected via native HTTP (${text.slice(0, 24).trim()})`,
        latencyMs: Date.now() - start,
      };
    } catch (fallbackErr: unknown) {
      const msg =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : err instanceof Error
          ? err.message
          : String(err);
      return {
        ok: false,
        message: msg,
        latencyMs: Date.now() - start,
      };
    }
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
    throw new Error(
      'Missing API Key. Please add your API key in the Settings tab first.'
    );
  }

  const cleanBase64 = params.base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();

  const promptParts = [
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

  const requestPayload = {
    model: 'gemini-3.8-flash',
    system_instruction:
      'You are CalQuest, an expert visual nutritionist and fitness coach. Break down every meal photo into accurate item-level calorie and macronutrient estimates and return strictly valid JSON matching the requested schema.',
    input: [
      {
        type: 'text' as const,
        text: promptParts.join('\n'),
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

  let rawText: string | null = null;

  if (Capacitor.isNativePlatform()) {
    // On Android APK, use native CapacitorHttp directly to avoid WebView CORS "TypeError: Failed to fetch"
    rawText = await callInteractionsViaNativeHttp(apiKey, requestPayload);
  } else {
    try {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create(requestPayload);
      rawText = interaction.output_text || null;
    } catch (sdkErr: unknown) {
      // Fallback to CapacitorHttp if browser fetch fails
      rawText = await callInteractionsViaNativeHttp(apiKey, requestPayload).catch(() => {
        throw sdkErr;
      });
    }
  }

  if (!rawText) {
    throw new Error('Empty response received from vision analysis. Please try snapping the photo again.');
  }

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
