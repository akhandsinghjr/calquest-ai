export interface MacroBreakdown {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
}

export interface DetectedFoodItem {
  name: string;
  portionEstimate: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  included?: boolean;
}

export interface GeminiMealAnalysis {
  mealName: string;
  emoji: string;
  totalCalories: number;
  macros: MacroBreakdown;
  items: DetectedFoodItem[];
  healthScore: number; // 1 to 100
  wittyFeedback: string;
  confidence: 'high' | 'medium' | 'low';
  latencyMs?: number;
  modelUsed?: string;
  payloadKb?: number;
}

export interface ScanProgressUpdate {
  stage: 'compressing' | 'connecting' | 'vision' | 'macros' | 'complete';
  percent: number;
  label: string;
  detail?: string;
  activeModel?: string;
  payloadKb?: number;
}

export interface MealLog extends GeminiMealAnalysis {
  id: string;
  timestamp: string; // ISO string
  dateKey: string; // YYYY-MM-DD local date
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  photoDataUrl?: string;
  xpEarned: number;
  portionMultiplier: number;
  userNote?: string;
  isFavorite?: boolean;
}

export interface SavedMealTemplate {
  id: string;
  mealName: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  totalCalories: number;
  macros: MacroBreakdown;
  healthScore: number;
  useCount: number;
  lastUsedAt: string;
}

export interface DailyJournalEntry {
  dateKey: string; // YYYY-MM-DD
  weightKg?: number;
  waterMl?: number;
  note?: string;
  energyLevel?: 'low' | 'steady' | 'peak';
  updatedAt: string;
}

export interface UserGoals {
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterMl: number;
}

export interface BiometricsProfile {
  sex: 'male' | 'female';
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  targetTimelineWeeks: number;
  bodyFatPct?: number; // optional for Katch-McArdle override
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete';
  resistanceTraining: boolean;
}

export interface MetabolicCalculationResult {
  rmrMifflin: number;
  rmrKatch: number;
  activeRmr: number;
  tdee: number;
  pal: number;
  estimatedBodyFatPct: number;
  leanMassKg: number;
  fatMassKg: number;
  forbesPartitionP: number;
  effectiveEnergyDensityKcalPerKg: number;
  metabolicAdaptationKcal: number;
  dailyCalorieDelta: number;
  targetDailyCalories: number;
  weeklyRateKg: number;
  recommendedWaterMl: number;
  isSafetyClamped: boolean;
  recommendedMacros: MacroBreakdown;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  unlockedAt?: string;
}

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  progress: number;
  target: number;
  completed: boolean;
  icon: string;
}

export interface UserState {
  userName?: string;
  onboardingCompleted?: boolean;
  onboardingCompletedV2?: boolean;
  xp: number;
  streakDays: number;
  longestStreak: number;
  lastLoggedDate: string | null; // YYYY-MM-DD
  streakFreezes: number;
  unlockedBadgeIds: string[];
  claimedQuestIdsByDate: Record<string, string[]>;
  dailyJournal: Record<string, DailyJournalEntry>;
  savedTemplates: SavedMealTemplate[];
  goals: UserGoals;
  biometrics: BiometricsProfile;
  customPromptInstruction: string;
}
