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
}

export interface UserGoals {
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
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
  xp: number;
  streakDays: number;
  longestStreak: number;
  lastLoggedDate: string | null; // YYYY-MM-DD
  streakFreezes: number;
  unlockedBadgeIds: string[];
  claimedQuestIdsByDate: Record<string, string[]>;
  goals: UserGoals;
  biometrics: BiometricsProfile;
  customPromptInstruction: string;
}
