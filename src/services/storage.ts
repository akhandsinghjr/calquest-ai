import type { MealLog, UserState } from '../types';
import { DEFAULT_BIOMETRICS, calculateScientificTargets } from './metabolicMath';

const STORAGE_KEY_STATE = 'calquest_user_state_v1';
const STORAGE_KEY_MEALS = 'calquest_meals_v1';
const IDB_NAME = 'calquest_journal_db_v1';
const IDB_VERSION = 1;

const defaultTargets = calculateScientificTargets(DEFAULT_BIOMETRICS);

export const DEFAULT_USER_STATE: UserState = {
  userName: '',
  onboardingCompleted: false,
  onboardingCompletedV2: false,
  xp: 0,
  streakDays: 0,
  longestStreak: 0,
  lastLoggedDate: null,
  streakFreezes: 1,
  unlockedBadgeIds: [],
  claimedQuestIdsByDate: {},
  dailyJournal: {},
  savedTemplates: [],
  goals: {
    dailyCalories: defaultTargets.targetDailyCalories,
    proteinGrams: defaultTargets.recommendedMacros.proteinGrams,
    carbsGrams: defaultTargets.recommendedMacros.carbsGrams,
    fatGrams: defaultTargets.recommendedMacros.fatGrams,
    fiberGrams: defaultTargets.recommendedMacros.fiberGrams,
    waterMl: defaultTargets.recommendedWaterMl,
  },
  biometrics: DEFAULT_BIOMETRICS,
  customPromptInstruction: '',
};

function openJournalIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openJournalIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openJournalIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function normalizeUserState(parsed?: Partial<UserState> | null): UserState {
  if (!parsed) return DEFAULT_USER_STATE;
  return {
    ...DEFAULT_USER_STATE,
    ...parsed,
    dailyJournal: parsed.dailyJournal || {},
    savedTemplates: Array.isArray(parsed.savedTemplates) ? parsed.savedTemplates : [],
    goals: {
      ...DEFAULT_USER_STATE.goals,
      ...(parsed.goals || {}),
      waterMl: Number(parsed.goals?.waterMl) || DEFAULT_USER_STATE.goals.waterMl,
    },
    biometrics: {
      ...DEFAULT_BIOMETRICS,
      ...(parsed.biometrics || {}),
    },
  };
}

export function loadUserState(): UserState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (!raw) return DEFAULT_USER_STATE;
    const parsed = JSON.parse(raw) as Partial<UserState>;
    return normalizeUserState(parsed);
  } catch {
    return DEFAULT_USER_STATE;
  }
}

export function saveUserState(state: UserState): void {
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
  } catch {
    // ignore localStorage quota error
  }
  void idbSet(STORAGE_KEY_STATE, state);
}

export function loadMeals(): MealLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MEALS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMeals(meals: MealLog[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(meals));
  } catch {
    // If photos exceed localStorage 5MB limit, store compact version in localStorage while full photos stay in IndexedDB
    try {
      const compactMeals = meals.map((m, idx) =>
        idx > 15 ? { ...m, photoDataUrl: undefined } : m
      );
      localStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(compactMeals));
    } catch {
      // ignore
    }
  }
  void idbSet(STORAGE_KEY_MEALS, meals);
}

/**
 * Hydrates full meal & state history from IndexedDB on startup if IndexedDB has a fuller record.
 */
export async function hydrateFromIndexedDb(): Promise<{
  state: UserState | null;
  meals: MealLog[] | null;
}> {
  const [idbState, idbMeals] = await Promise.all([
    idbGet<UserState>(STORAGE_KEY_STATE),
    idbGet<MealLog[]>(STORAGE_KEY_MEALS),
  ]);
  return {
    state: idbState ? normalizeUserState(idbState) : null,
    meals: Array.isArray(idbMeals) ? idbMeals : null,
  };
}

export function exportJournalBackup(state: UserState, meals: MealLog[]): string {
  return JSON.stringify(
    {
      version: 3,
      exportedAt: new Date().toISOString(),
      userState: state,
      meals,
    },
    null,
    2
  );
}

export function importJournalBackup(rawJson: string): {
  userState: UserState;
  meals: MealLog[];
} {
  const data = JSON.parse(rawJson) as {
    userState?: Partial<UserState>;
    meals?: MealLog[];
  };
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid backup file format.');
  }
  const userState = normalizeUserState(data.userState);
  const meals = Array.isArray(data.meals) ? data.meals : [];
  saveUserState(userState);
  saveMeals(meals);
  return { userState, meals };
}

export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEY_STATE);
  localStorage.removeItem(STORAGE_KEY_MEALS);
  void idbSet(STORAGE_KEY_STATE, DEFAULT_USER_STATE);
  void idbSet(STORAGE_KEY_MEALS, []);
}
