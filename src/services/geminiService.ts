import { GoogleGenAI } from '@google/genai';
import type { GeminiMealAnalysis, GeminiModelId } from '../types';

const STORAGE_KEY_API = 'calquest_gemini_api_key';

export const AVAILABLE_GEMINI_MODELS: {
  id: GeminiModelId;
  name: string;
  tierLabel: string;
  isFreeTier: boolean;
  description: string;
}[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tierLabel: 'FREE TIER • Best Balance',
    isFreeTier: true,
    description:
      'Most intelligent Flash model with multimodal thinking. 100% free in Google AI Studio (~96% as accurate as Argon, 2.5x faster).',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    tierLabel: 'FREE TIER • Ultra Fast',
    isFreeTier: true,
    description:
      'Fastest free-tier model with the highest daily request quota. Great for quick everyday snacks and standard meals.',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    tierLabel: 'PAID TIER • Flagship',
    isFreeTier: false,
    description:
      'Flagship reasoning model ($2/1M input, $10/1M output). Requires a paid billing account in Google AI Studio.',
  },
];

export function getStoredApiKey(): string {
  const localKey = localStorage.getItem(STORAGE_KEY_API)?.trim();
  if (localKey) return localKey;
  const envKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  return envKey || '';
}

export function setStoredApiKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY_API, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY_API);
  }
}

export function hasBuiltInApiKey(): boolean {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY?.trim());
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
        'Short, encouraging, gamified coach comment (1-2 sentences) praising good choices or giving a playful tip.',
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

export async function analyzeFoodPhotoWithGemini(params: {
  base64Data: string;
  mimeType: string;
  model?: GeminiModelId;
  userNote?: string;
  customInstruction?: string;
}): Promise<GeminiMealAnalysis> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error(
      'Missing Gemini API Key. Please add your free Google AI Studio key in the Settings tab.'
    );
  }

  const selectedModel: GeminiModelId = params.model || 'gemini-3.8-flash';
  const client = new GoogleGenAI({ apiKey });

  const promptParts = [
    'Analyze this food photo and calculate its calories and macronutrients accurately.',
    'Estimate realistic portion sizes using visual cues such as plate size, utensils, bowl depth, or packaging.',
    'Include hidden calories such as cooking oils, sauces, dressings, or butter where visually or culinarily typical.',
  ];

  if (params.customInstruction?.trim()) {
    promptParts.push(`Personal dietary context: ${params.customInstruction.trim()}`);
  }

  if (params.userNote?.trim()) {
    promptParts.push(`User note about this specific meal: ${params.userNote.trim()}`);
  }

  const interaction = await client.interactions.create({
    model: selectedModel,
    system_instruction:
      'You are CalQuest AI, an expert visual nutritionist and gamified fitness coach. Break down every meal photo into accurate item-level calorie and macronutrient estimates and return strictly valid JSON matching the requested schema.',
    input: [
      {
        type: 'text',
        text: promptParts.join('\n'),
      },
      {
        type: 'image',
        data: params.base64Data,
        mime_type: params.mimeType,
      },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: MEAL_ANALYSIS_SCHEMA,
    },
  });

  const rawText = interaction.output_text;
  if (!rawText) {
    throw new Error(`${selectedModel} returned an empty response. Please try snapping the photo again.`);
  }

  const parsed = JSON.parse(rawText) as GeminiMealAnalysis;

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
