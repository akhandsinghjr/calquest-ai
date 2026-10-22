import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { GoogleGenAI } from '@google/genai';
import type { GeminiMealAnalysis, ScanProgressUpdate } from '../types';

const STORAGE_KEY_API = 'calquest_gemini_api_key';
const STORAGE_KEY_FAST_ROUTE = 'calquest_fast_route_v2';
const STORAGE_KEY_DISCOVERED_MODELS = 'calquest_discovered_models_v2';
const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Low-latency cascade of multimodal vision models.
 * Flash-Lite and Flash models with minimal thinking deliver the fastest time-to-JSON.
 */
const MODEL_FAILOVER_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
];

type EndpointKind = 'interactions' | 'generateContent';

interface CachedFastRoute {
  model: string;
  endpoint: EndpointKind;
  latencyMs: number;
  updatedAt: number;
}

let inMemoryFastRoute: CachedFastRoute | null = null;
let inMemoryDiscoveredModels: { models: string[]; updatedAt: number } | null = null;

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
  // Reset cached route when API key changes
  inMemoryFastRoute = null;
  try {
    localStorage.removeItem(STORAGE_KEY_FAST_ROUTE);
  } catch {
    // ignore storage errors
  }
}

export function hasBuiltInApiKey(): boolean {
  return Boolean(sanitizeApiKey(import.meta.env.VITE_GEMINI_API_KEY));
}

export function getCachedFastRoute(): CachedFastRoute | null {
  const now = Date.now();
  if (inMemoryFastRoute && now - inMemoryFastRoute.updatedAt < ROUTE_CACHE_TTL_MS) {
    return inMemoryFastRoute;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FAST_ROUTE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFastRoute;
    if (
      parsed &&
      typeof parsed.model === 'string' &&
      (parsed.endpoint === 'interactions' || parsed.endpoint === 'generateContent') &&
      now - Number(parsed.updatedAt || 0) < ROUTE_CACHE_TTL_MS
    ) {
      inMemoryFastRoute = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveCachedFastRoute(route: CachedFastRoute): void {
  inMemoryFastRoute = route;
  try {
    localStorage.setItem(STORAGE_KEY_FAST_ROUTE, JSON.stringify(route));
  } catch {
    // ignore
  }
}

/**
 * Compact schema without verbose descriptions to speed up constrained decoding compilation
 * and minimize output tokens.
 */
const MEAL_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    mealName: { type: 'string' },
    emoji: { type: 'string' },
    totalCalories: { type: 'number' },
    macros: {
      type: 'object',
      properties: {
        proteinGrams: { type: 'number' },
        carbsGrams: { type: 'number' },
        fatGrams: { type: 'number' },
        fiberGrams: { type: 'number' },
      },
      required: ['proteinGrams', 'carbsGrams', 'fatGrams', 'fiberGrams'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portionEstimate: { type: 'string' },
          calories: { type: 'number' },
          proteinGrams: { type: 'number' },
          carbsGrams: { type: 'number' },
          fatGrams: { type: 'number' },
        },
        required: [
          'name',
          'portionEstimate',
          'calories',
          'proteinGrams',
          'carbsGrams',
          'fatGrams',
        ],
      },
    },
    healthScore: { type: 'number' },
    wittyFeedback: { type: 'string' },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
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

function isFatalAuthError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthenticated')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Primary call via Interactions API (/v1beta/interactions) with minimal thinking & store=false
 * to eliminate server-side reasoning and persistence latency.
 */
async function callInteractionsSingleModel(
  apiKey: string,
  model: string,
  basePayload: Omit<Record<string, unknown>, 'model'>
): Promise<string> {
  const fastPayload = {
    ...basePayload,
    model,
    store: false,
    generation_config: {
      thinking_level: 'minimal',
      temperature: 0.2,
    },
  };

  if (!Capacitor.isNativePlatform()) {
    try {
      const client = new GoogleGenAI({ apiKey });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interaction = await client.interactions.create(fastPayload as any);
      if (interaction.output_text) {
        return interaction.output_text;
      }
    } catch (sdkErr) {
      if (isFatalAuthError(sdkErr)) {
        throw sdkErr;
      }
    }
  }

  let res = await CapacitorHttp.post({
    url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    data: fastPayload,
    connectTimeout: 7000,
    readTimeout: 12000,
  });

  // If the specific model doesn't support `thinking_level: minimal`, retry immediately without generation_config
  if (res.status === 400) {
    const fallbackPayload = { ...basePayload, model, store: false };
    res = await CapacitorHttp.post({
      url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      data: fallbackPayload,
      connectTimeout: 7000,
      readTimeout: 12000,
    });
  }

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
 * Low-latency `:generateContent` call with `thinkingBudget: 0` so the model outputs
 * JSON tokens immediately without spending 4-8 seconds on hidden reasoning tokens.
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

  const baseGenConfig: Record<string, unknown> = {
    temperature: 0.2,
  };
  if (jsonSchema) {
    baseGenConfig.responseMimeType = 'application/json';
    baseGenConfig.responseSchema = jsonSchema;
  }

  const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  // First try with thinkingBudget: 0 for near-instant time-to-first-token
  let res = await CapacitorHttp.post({
    url: endpointUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        ...baseGenConfig,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    },
    connectTimeout: 7000,
    readTimeout: 12000,
  });

  // If the model rejects `thinkingConfig`, immediately call with standard baseGenConfig
  if (res.status === 400) {
    res = await CapacitorHttp.post({
      url: endpointUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        contents: [{ role: 'user', parts }],
        generationConfig: baseGenConfig,
      },
      connectTimeout: 7000,
      readTimeout: 12000,
    });
  }

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
 * Queries and caches the user's accessible Flash/Lite models so we never waste roundtrips
 * fetching `/v1beta/models` on every meal scan.
 */
async function discoverAvailableVisionModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (
    inMemoryDiscoveredModels &&
    now - inMemoryDiscoveredModels.updatedAt < ROUTE_CACHE_TTL_MS &&
    inMemoryDiscoveredModels.models.length > 0
  ) {
    return inMemoryDiscoveredModels.models;
  }

  try {
    const cachedRaw = localStorage.getItem(STORAGE_KEY_DISCOVERED_MODELS);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw) as { models: string[]; updatedAt: number };
      if (
        Array.isArray(parsed?.models) &&
        parsed.models.length > 0 &&
        now - Number(parsed.updatedAt || 0) < ROUTE_CACHE_TTL_MS
      ) {
        inMemoryDiscoveredModels = parsed;
        return parsed.models;
      }
    }
  } catch {
    // ignore
  }

  try {
    const res = await CapacitorHttp.get({
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      connectTimeout: 5000,
      readTimeout: 7000,
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
        !rawName.includes('audio') &&
        (methods.length === 0 || methods.includes('generateContent'))
      ) {
        candidates.push(rawName);
      }
    }

    // Prioritize flash-lite first for lowest latency, then flash
    candidates.sort((a, b) => {
      const score = (name: string) => {
        if (name.includes('flash-lite')) return 0;
        if (name.includes('flash')) return 1;
        return 2;
      };
      return score(a) - score(b);
    });

    const entry = { models: candidates, updatedAt: now };
    inMemoryDiscoveredModels = entry;
    try {
      localStorage.setItem(STORAGE_KEY_DISCOVERED_MODELS, JSON.stringify(entry));
    } catch {
      // ignore
    }

    return candidates;
  } catch {
    return [];
  }
}

async function trySingleRoute(params: {
  apiKey: string;
  model: string;
  endpoint: EndpointKind;
  basePayload: Omit<Record<string, unknown>, 'model'>;
  promptText: string;
  base64Image?: string;
  mimeType?: string;
  jsonSchema?: Record<string, unknown>;
}): Promise<{ text: string; modelUsed: string; latencyMs: number }> {
  const t0 = Date.now();
  const text =
    params.endpoint === 'interactions'
      ? await callInteractionsSingleModel(params.apiKey, params.model, params.basePayload)
      : await callModelsEndpointFailover(
          params.apiKey,
          params.model,
          params.promptText,
          params.base64Image,
          params.mimeType,
          params.jsonSchema
        );
  const latencyMs = Date.now() - t0;
  saveCachedFastRoute({
    model: params.model,
    endpoint: params.endpoint,
    latencyMs,
    updatedAt: Date.now(),
  });
  return { text, modelUsed: params.model, latencyMs };
}

/**
 * Executes a request with sticky fast-route caching and zero-duplicate failover.
 * 1. If we already know the fastest working (model, endpoint) from a previous call,
 *    it executes immediately on Attempt #1 (0 wasted probes).
 * 2. Otherwise it walks the deduplicated low-latency candidate list with progress callbacks.
 */
async function executeWithResilientFailover(params: {
  apiKey: string;
  basePayload: Omit<Record<string, unknown>, 'model'>;
  promptText: string;
  base64Image?: string;
  mimeType?: string;
  jsonSchema?: Record<string, unknown>;
  payloadKb?: number;
  onProgress?: (update: ScanProgressUpdate) => void;
}): Promise<{ text: string; modelUsed: string; latencyMs: number }> {
  let lastError: unknown = null;
  const triedRoutes = new Set<string>();

  // FAST PATH: Try sticky cached route first!
  const cachedRoute = getCachedFastRoute();
  if (cachedRoute) {
    const routeKey = `${cachedRoute.endpoint}:${cachedRoute.model}`;
    triedRoutes.add(routeKey);
    params.onProgress?.({
      stage: 'vision',
      percent: 42,
      label: `Analyzing plate with ${cachedRoute.model}`,
      detail: 'Fast-path route active • Minimal thinking latency',
      activeModel: cachedRoute.model,
      payloadKb: params.payloadKb,
    });
    try {
      return await trySingleRoute({
        ...params,
        model: cachedRoute.model,
        endpoint: cachedRoute.endpoint,
      });
    } catch (err) {
      lastError = err;
      if (isFatalAuthError(err)) throw err;
    }
  }

  // Build candidate list (combining prioritized chain + cached/discovered server models)
  const discoveredModels = await discoverAvailableVisionModels(params.apiKey);
  const allCandidates = Array.from(new Set([...discoveredModels, ...MODEL_FAILOVER_CHAIN]));

  // Try each candidate across the fastest endpoint first without ever repeating a (endpoint, model) pair
  const endpointsOrder: EndpointKind[] =
    discoveredModels.length > 0
      ? ['generateContent', 'interactions']
      : ['interactions', 'generateContent'];

  let attemptIdx = 0;
  for (const model of allCandidates) {
    for (const endpoint of endpointsOrder) {
      const routeKey = `${endpoint}:${model}`;
      if (triedRoutes.has(routeKey)) continue;
      triedRoutes.add(routeKey);
      attemptIdx++;

      params.onProgress?.({
        stage: 'vision',
        percent: Math.min(76, 36 + attemptIdx * 8),
        label: `Analyzing portions with ${model}`,
        detail:
          attemptIdx === 1
            ? 'Segmenting food items & estimating 3D volume'
            : `Switching to low-latency node (${model})`,
        activeModel: model,
        payloadKb: params.payloadKb,
      });

      try {
        return await trySingleRoute({
          ...params,
          model,
          endpoint,
        });
      } catch (err) {
        lastError = err;
        if (isFatalAuthError(err)) {
          throw err;
        }
        await sleep(60);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        'Service is temporarily experiencing high demand (503). Please tap again in a few seconds.'
      );
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
      message: `Connected (${modelUsed} • Fast Route Cached)`,
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
  onProgress?: (update: ScanProgressUpdate) => void;
}): Promise<GeminiMealAnalysis> {
  const overallStart = Date.now();
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Missing API Key. Please add your API key in the Settings tab first.');
  }

  const cleanBase64 = params.base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
  const payloadKb = Math.max(1, Math.round((cleanBase64.length * 0.75) / 1024));

  params.onProgress?.({
    stage: 'connecting',
    percent: 22,
    label: 'Prepared single-tile vision payload',
    detail: `Compressed to ${payloadKb} KB • Connecting to Gemini Flash`,
    payloadKb,
  });

  const promptParts = [
    'Analyze this meal photo and return JSON with accurate item-level calories and macros (protein, carbs, fat, fiber in grams).',
    'Estimate realistic portion weights from plate/bowl geometry and include typical cooking oils or sauces.',
    'Do not use emojis anywhere.',
  ];

  if (params.customInstruction?.trim()) {
    promptParts.push(`Dietary context: ${params.customInstruction.trim()}`);
  }

  if (params.userNote?.trim()) {
    promptParts.push(`Meal note: ${params.userNote.trim()}`);
  }

  const promptText = promptParts.join('\n');

  const basePayload = {
    system_instruction:
      'You are CalQuest, a fast and accurate visual nutritionist. Return strictly valid JSON matching the schema with zero emojis.',
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

  const { text: rawText, modelUsed } = await executeWithResilientFailover({
    apiKey,
    basePayload,
    promptText,
    base64Image: cleanBase64,
    mimeType: params.mimeType || 'image/jpeg',
    jsonSchema: MEAL_ANALYSIS_SCHEMA,
    payloadKb,
    onProgress: params.onProgress,
  });

  params.onProgress?.({
    stage: 'macros',
    percent: 88,
    label: 'Synthesizing macro & calorie breakdown',
    detail: `Received structured response from ${modelUsed}`,
    activeModel: modelUsed,
    payloadKb,
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

  const totalLatencyMs = Date.now() - overallStart;

  params.onProgress?.({
    stage: 'complete',
    percent: 100,
    label: 'Analysis complete',
    detail: `Completed in ${(totalLatencyMs / 1000).toFixed(1)}s via ${modelUsed}`,
    activeModel: modelUsed,
    payloadKb,
  });

  return {
    mealName: parsed.mealName || 'Scanned Meal',
    emoji: 'utensils',
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
    latencyMs: totalLatencyMs,
    modelUsed,
    payloadKb,
  };
}
