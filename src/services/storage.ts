import type { MealLog, UserState } from '../types';
import { DEFAULT_BIOMETRICS, calculateScientificTargets } from './metabolicMath';

const STORAGE_KEY_STATE = 'calquest_user_state_v1';
const STORAGE_KEY_MEALS = 'calquest_meals_v1';

const defaultTargets = calculateScientificTargets(DEFAULT_BIOMETRICS);

export const DEFAULT_USER_STATE: UserState = {
  xp: 0,
  streakDays: 0,
  longestStreak: 0,
  lastLoggedDate: null,
  streakFreezes: 1,
  unlockedBadgeIds: [],
  claimedQuestIdsByDate: {},
  goals: {
    dailyCalories: defaultTargets.targetDailyCalories,
    proteinGrams: defaultTargets.recommendedMacros.proteinGrams,
    carbsGrams: defaultTargets.recommendedMacros.carbsGrams,
    fatGrams: defaultTargets.recommendedMacros.fatGrams,
    fiberGrams: defaultTargets.recommendedMacros.fiberGrams,
  },
  biometrics: DEFAULT_BIOMETRICS,
  customPromptInstruction: '',
};

export function loadUserState(): UserState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (!raw) return DEFAULT_USER_STATE;
    const parsed = JSON.parse(raw) as Partial<UserState>;
    return {
      ...DEFAULT_USER_STATE,
      ...parsed,
      goals: {
        ...DEFAULT_USER_STATE.goals,
        ...(parsed.goals || {}),
      },
      biometrics: {
        ...DEFAULT_BIOMETRICS,
        ...(parsed.biometrics || {}),
      },
    };
  } catch {
    return DEFAULT_USER_STATE;
  }
}

export function saveUserState(state: UserState): void {
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
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
    // ignore storage quota errors
  }
}

export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEY_STATE);
  localStorage.removeItem(STORAGE_KEY_MEALS);
}
