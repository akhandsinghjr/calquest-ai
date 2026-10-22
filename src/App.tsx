import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  Apple,
  ArrowLeft,
  ArrowRight,
  Award,
  Bookmark,
  BookOpen,
  Calculator,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Compass,
  Crown,
  Download,
  Droplets,
  Dumbbell,
  Eye,
  EyeOff,
  Flame,
  Image as ImageIcon,
  Info,
  KeyRound,
  Leaf,
  Loader2,
  Medal,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Settings,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  Swords,
  Target,
  Trash2,
  Trophy,
  Upload,
  Utensils,
  Wheat,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type {
  Badge,
  BiometricsProfile,
  DailyJournalEntry,
  DetectedFoodItem,
  GeminiMealAnalysis,
  MealLog,
  SavedMealTemplate,
  ScanProgressUpdate,
  UserGoals,
  UserState,
} from './types';
import {
  EditMealModal,
  FrequentMealsModal,
  HydrationTrackerCard,
} from './components/ActionModals';
import {
  CalQuestLogoMark,
  EmptyPlateVector,
  MetabolicEquationVector,
  OnboardingHeroVector,
  ScannerViewfinderVector,
} from './components/BrandVectors';
import {
  ALL_BADGES,
  calculateMealXp,
  computeDailyQuests,
  evaluateNewlyUnlockedBadges,
  getLevelInfo,
  getLocalDateKey,
  updateStreakOnLog,
} from './services/gamification';
import {
  analyzeFoodPhotoWithGemini,
  getStoredApiKey,
  hasBuiltInApiKey,
  setStoredApiKey,
  testGeminiConnection,
} from './services/geminiService';
import {
  ACTIVITY_LABELS,
  calculateScientificTargets,
  DEFAULT_BIOMETRICS,
} from './services/metabolicMath';
import {
  clearAllData,
  exportJournalBackup,
  hydrateFromIndexedDb,
  importJournalBackup,
  loadMeals,
  loadUserState,
  saveMeals,
  saveUserState,
} from './services/storage';

type NavTab = 'dashboard' | 'journal' | 'scan' | 'quests' | 'settings';

const M3_SPRING = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 28,
  mass: 0.85,
};

const M3_SOFT_SPRING = {
  type: 'spring' as const,
  stiffness: 240,
  damping: 26,
};

/**
 * Controlled numeric input that preserves raw string keystrokes while typing/backspacing
 * so clearing a box never snaps back mid-keystroke.
 */
function NumericField({
  value,
  onChangeNumber,
  placeholder,
  className,
  step = 'any',
}: {
  value: number | undefined;
  onChangeNumber: (val: number | undefined) => void;
  placeholder?: string;
  className?: string;
  step?: string;
}) {
  const [raw, setRaw] = useState<string>(() =>
    value !== undefined && !Number.isNaN(value) ? String(value) : ''
  );

  useEffect(() => {
    const parsedRaw = raw.trim() === '' ? undefined : Number(raw);
    if (value !== parsedRaw) {
      setRaw(value !== undefined && !Number.isNaN(value) ? String(value) : '');
    }
  }, [value]);

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={raw}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next.trim() === '') {
          onChangeNumber(undefined);
        } else {
          const num = Number(next);
          if (!Number.isNaN(num)) {
            onChangeNumber(num);
          }
        }
      }}
      className={className}
    />
  );
}

function RenderVectorIcon({
  name,
  className = 'w-5 h-5',
}: {
  name: string;
  className?: string;
}) {
  switch (name) {
    case 'sprout':
      return <Sprout className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'shield':
      return <Shield className={className} />;
    case 'swords':
      return <Swords className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'zap':
      return <Zap className={className} />;
    case 'camera':
      return <Camera className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'leaf':
      return <Leaf className={className} />;
    case 'dumbbell':
      return <Dumbbell className={className} />;
    case 'award':
      return <Award className={className} />;
    case 'target':
      return <Target className={className} />;
    case 'wheat':
      return <Wheat className={className} />;
    case 'medal':
      return <Medal className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    case 'breakfast':
      return <Coffee className={className} />;
    case 'lunch':
      return <Sun className={className} />;
    case 'dinner':
      return <Moon className={className} />;
    case 'snack':
      return <Apple className={className} />;
    default:
      return <Utensils className={className} />;
  }
}

function getPastDateKeys(daysCount: number): {
  dateKey: string;
  dayShort: string;
  dayNum: string;
  monthShort: string;
  isToday: boolean;
}[] {
  const result = [];
  const now = new Date();
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateKey = getLocalDateKey(d);
    const dayShort = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = String(d.getDate());
    const monthShort = d.toLocaleDateString('en-US', { month: 'short' });
    result.push({
      dateKey,
      dayShort,
      dayNum,
      monthShort,
      isToday: i === 0,
    });
  }
  return result;
}

async function compressImageDataUrl(dataUrl: string, maxWidth = 720): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.76));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [meals, setMeals] = useState<MealLog[]>(() => loadMeals());
  const [userState, setUserState] = useState<UserState>(() => loadUserState());

  // Onboarding wizard state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    const initial = loadUserState();
    return !initial.onboardingCompletedV2;
  });
  const [onboardingStep, setOnboardingStep] = useState<number>(0);
  const [nameDraft, setNameDraft] = useState<string>(() => loadUserState().userName || '');

  // Journal selected date & daily check-in drafts
  const todayKey = getLocalDateKey();
  const [selectedJournalDate, setSelectedJournalDate] = useState<string>(todayKey);
  const [journalWeightDraft, setJournalWeightDraft] = useState<string>('');
  const [journalNoteDraft, setJournalNoteDraft] = useState<string>('');
  const [journalEnergyDraft, setJournalEnergyDraft] = useState<'low' | 'steady' | 'peak'>('steady');
  const [journalSavedToast, setJournalSavedToast] = useState(false);

  // Edit Meal & Frequent Meals modal states
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);
  const [quickAddModalDate, setQuickAddModalDate] = useState<string | null>(null);

  // Settings & API state
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [goalsDraft, setGoalsDraft] = useState<UserGoals>(() => loadUserState().goals);
  const [biometricsDraft, setBiometricsDraft] = useState<BiometricsProfile>(
    () => loadUserState().biometrics || DEFAULT_BIOMETRICS
  );
  const [customPromptDraft, setCustomPromptDraft] = useState<string>(
    () => loadUserState().customPromptInstruction
  );
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);
  const [mathAppliedToast, setMathAppliedToast] = useState(false);
  const [backupToast, setBackupToast] = useState<string | null>(null);
  const [showFormulaSheet, setShowFormulaSheet] = useState(false);

  // API diagnostic state
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);

  // Scan & AI analysis state
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 18) return 'snack';
    return 'dinner';
  });
  const [userNote, setUserNote] = useState('');
  const [lastAnalyzedNote, setLastAnalyzedNote] = useState('');
  const [autoScanOnCapture, setAutoScanOnCapture] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressUpdate>({
    stage: 'compressing',
    percent: 0,
    label: 'Ready to scan',
  });
  const [scanElapsedMs, setScanElapsedMs] = useState<number>(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<GeminiMealAnalysis | null>(null);
  const [portionMultiplier, setPortionMultiplier] = useState<number>(1);
  const [editableItems, setEditableItems] = useState<DetectedFoodItem[]>([]);

  // Celebration overlay
  const [celebrationData, setCelebrationData] = useState<{
    xpGained: number;
    newBadges: Badge[];
    leveledUp: boolean;
    newLevel: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate from IndexedDB on initial mount
  useEffect(() => {
    let mounted = true;
    hydrateFromIndexedDb().then(({ state, meals: idbMeals }) => {
      if (!mounted) return;
      if (idbMeals && idbMeals.length > meals.length) {
        setMeals(idbMeals);
      }
      if (state && (state.xp > userState.xp || state.onboardingCompletedV2)) {
        setUserState(state);
        setGoalsDraft(state.goals);
        setBiometricsDraft(state.biometrics);
        if (state.userName) setNameDraft(state.userName);
        if (state.onboardingCompletedV2) setShowOnboarding(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    saveMeals(meals);
  }, [meals]);

  useEffect(() => {
    saveUserState(userState);
  }, [userState]);

  // Sync Journal check-in inputs when selectedJournalDate changes
  useEffect(() => {
    const entry = userState.dailyJournal?.[selectedJournalDate];
    setJournalWeightDraft(entry?.weightKg !== undefined ? String(entry.weightKg) : '');
    setJournalNoteDraft(entry?.note || '');
    setJournalEnergyDraft(entry?.energyLevel || 'steady');
  }, [selectedJournalDate, userState.dailyJournal]);

  const todayMeals = useMemo(
    () => meals.filter((m) => m.dateKey === todayKey),
    [meals, todayKey]
  );

  const selectedDateMeals = useMemo(
    () => meals.filter((m) => m.dateKey === selectedJournalDate),
    [meals, selectedJournalDate]
  );

  /**
   * Deduplicated Frequent & Saved Staple Meals list for 1-tap re-logging
   */
  const frequentMealsList = useMemo<SavedMealTemplate[]>(() => {
    const map = new Map<string, SavedMealTemplate>();

    // First add explicit saved templates
    for (const tpl of userState.savedTemplates || []) {
      const key = tpl.mealName.trim().toLowerCase();
      map.set(key, { ...tpl });
    }

    // Then aggregate from historical meal logs
    for (const m of meals) {
      const key = m.mealName.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.useCount += 1;
        if (m.timestamp > existing.lastUsedAt) {
          existing.lastUsedAt = m.timestamp;
        }
      } else {
        map.set(key, {
          id: `hist_${m.id}`,
          mealName: m.mealName,
          mealType: m.mealType,
          totalCalories: m.totalCalories,
          macros: { ...m.macros },
          healthScore: m.healthScore || 80,
          useCount: 1,
          lastUsedAt: m.timestamp,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    });
  }, [meals, userState.savedTemplates]);

  const todayTotals = useMemo(() => {
    return todayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.totalCalories,
        protein: acc.protein + m.macros.proteinGrams,
        carbs: acc.carbs + m.macros.carbsGrams,
        fat: acc.fat + m.macros.fatGrams,
        fiber: acc.fiber + m.macros.fiberGrams,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [todayMeals]);

  const selectedDateTotals = useMemo(() => {
    return selectedDateMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.totalCalories,
        protein: acc.protein + m.macros.proteinGrams,
        carbs: acc.carbs + m.macros.carbsGrams,
        fat: acc.fat + m.macros.fatGrams,
        fiber: acc.fiber + m.macros.fiberGrams,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [selectedDateMeals]);

  const todayWaterMl = userState.dailyJournal?.[todayKey]?.waterMl || 0;
  const selectedDateWaterMl = userState.dailyJournal?.[selectedJournalDate]?.waterMl || 0;

  const past14Days = useMemo(() => getPastDateKeys(14), [todayKey]);
  const past7Days = useMemo(() => past14Days.slice(-7), [past14Days]);

  const journal7DayStats = useMemo(() => {
    const daySummaries = past7Days.map((d) => {
      const dayMeals = meals.filter((m) => m.dateKey === d.dateKey);
      const calories = dayMeals.reduce((s, m) => s + m.totalCalories, 0);
      const protein = dayMeals.reduce((s, m) => s + m.macros.proteinGrams, 0);
      const weight = userState.dailyJournal?.[d.dateKey]?.weightKg;
      const waterMl = userState.dailyJournal?.[d.dateKey]?.waterMl || 0;
      return {
        ...d,
        calories,
        protein,
        mealCount: dayMeals.length,
        weight,
        waterMl,
      };
    });

    const activeDays = daySummaries.filter((d) => d.mealCount > 0);
    const avgCalories =
      activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + d.calories, 0) / activeDays.length)
        : 0;
    const avgProtein =
      activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + d.protein, 0) / activeDays.length)
        : 0;

    return {
      daySummaries,
      activeDaysCount: activeDays.length,
      avgCalories,
      avgProtein,
    };
  }, [past7Days, meals, userState.dailyJournal]);

  const levelInfo = useMemo(() => getLevelInfo(userState.xp), [userState.xp]);
  const dailyQuests = useMemo(
    () => computeDailyQuests(todayMeals, userState.goals),
    [todayMeals, userState.goals]
  );

  const metabolicResult = useMemo(
    () => calculateScientificTargets(biometricsDraft),
    [biometricsDraft]
  );

  const adjustedAnalysis = useMemo(() => {
    if (!analysisResult) return null;
    const includedItems = editableItems.filter((item) => item.included !== false);
    const rawCal = includedItems.reduce((s, i) => s + i.calories, 0);
    const rawProt = includedItems.reduce((s, i) => s + i.proteinGrams, 0);
    const rawCarbs = includedItems.reduce((s, i) => s + i.carbsGrams, 0);
    const rawFat = includedItems.reduce((s, i) => s + i.fatGrams, 0);

    const baseCal = rawCal > 0 ? rawCal : analysisResult.totalCalories;
    const baseProt = rawProt > 0 ? rawProt : analysisResult.macros.proteinGrams;
    const baseCarbs = rawCarbs > 0 ? rawCarbs : analysisResult.macros.carbsGrams;
    const baseFat = rawFat > 0 ? rawFat : analysisResult.macros.fatGrams;

    return {
      totalCalories: Math.round(baseCal * portionMultiplier),
      macros: {
        proteinGrams: Math.round(baseProt * portionMultiplier),
        carbsGrams: Math.round(baseCarbs * portionMultiplier),
        fatGrams: Math.round(baseFat * portionMultiplier),
        fiberGrams: Math.round(analysisResult.macros.fiberGrams * portionMultiplier),
      },
    };
  }, [analysisResult, editableItems, portionMultiplier]);

  const hasApiKeyConfigured = Boolean(getStoredApiKey());

  function updateWaterForDate(dateKey: string, nextWaterMl: number) {
    const clamped = Math.max(0, Math.round(nextWaterMl));
    setUserState((prev) => {
      const existing = prev.dailyJournal?.[dateKey] || {
        dateKey,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...prev,
        dailyJournal: {
          ...(prev.dailyJournal || {}),
          [dateKey]: {
            ...existing,
            waterMl: clamped,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }

  function handleSaveMealEdit(updatedMeal: MealLog) {
    setMeals((prev) => prev.map((m) => (m.id === updatedMeal.id ? updatedMeal : m)));
    setEditingMeal(null);
  }

  function handleSaveMealAsTemplate(meal: MealLog) {
    const newTpl: SavedMealTemplate = {
      id: `tpl_${Date.now()}`,
      mealName: meal.mealName,
      mealType: meal.mealType,
      totalCalories: meal.totalCalories,
      macros: { ...meal.macros },
      healthScore: meal.healthScore || 82,
      useCount: 1,
      lastUsedAt: new Date().toISOString(),
    };
    setUserState((prev) => {
      const filtered = (prev.savedTemplates || []).filter(
        (t) => t.mealName.trim().toLowerCase() !== meal.mealName.trim().toLowerCase()
      );
      return {
        ...prev,
        savedTemplates: [newTpl, ...filtered],
      };
    });
  }

  function handleDeleteTemplate(id: string) {
    setUserState((prev) => ({
      ...prev,
      savedTemplates: (prev.savedTemplates || []).filter((t) => t.id !== id),
    }));
  }

  function handleQuickLogTemplate(
    template: Omit<SavedMealTemplate, 'id' | 'useCount' | 'lastUsedAt'>,
    saveToStaples: boolean,
    targetDate: string = todayKey
  ) {
    const xpCalc = calculateMealXp(template.healthScore || 80);
    const newMeal: MealLog = {
      id: `meal_${Date.now()}`,
      timestamp: new Date().toISOString(),
      dateKey: targetDate,
      mealType: template.mealType,
      mealName: template.mealName,
      emoji: 'utensils',
      totalCalories: template.totalCalories,
      macros: { ...template.macros },
      items: [],
      healthScore: template.healthScore || 80,
      wittyFeedback: 'Logged from your frequent meals library.',
      confidence: 'high',
      xpEarned: xpCalc.totalXp,
      portionMultiplier: 1,
    };

    const updatedMeals = [newMeal, ...meals];
    const streakInfo = updateStreakOnLog(userState, todayKey);
    const newTotalXp = userState.xp + xpCalc.totalXp;

    setMeals(updatedMeals);
    setUserState((prev) => {
      let nextTemplates = prev.savedTemplates || [];
      if (saveToStaples) {
        const filtered = nextTemplates.filter(
          (t) => t.mealName.trim().toLowerCase() !== template.mealName.trim().toLowerCase()
        );
        nextTemplates = [
          {
            id: `tpl_${Date.now()}`,
            ...template,
            useCount: 1,
            lastUsedAt: new Date().toISOString(),
          },
          ...filtered,
        ];
      }
      return {
        ...prev,
        xp: newTotalXp,
        streakDays: streakInfo.streakDays,
        longestStreak: streakInfo.longestStreak,
        streakFreezes: streakInfo.streakFreezes,
        lastLoggedDate: todayKey,
        savedTemplates: nextTemplates,
      };
    });
  }

  function handleFinishOnboarding() {
    if (apiKeyInput.trim()) {
      setStoredApiKey(apiKeyInput);
    }
    const newGoals: UserGoals = {
      dailyCalories: metabolicResult.targetDailyCalories,
      proteinGrams: metabolicResult.recommendedMacros.proteinGrams,
      carbsGrams: metabolicResult.recommendedMacros.carbsGrams,
      fatGrams: metabolicResult.recommendedMacros.fatGrams,
      fiberGrams: metabolicResult.recommendedMacros.fiberGrams,
      waterMl: metabolicResult.recommendedWaterMl,
    };
    setGoalsDraft(newGoals);
    const existingToday = userState.dailyJournal?.[todayKey];
    const todayEntry: DailyJournalEntry = {
      dateKey: todayKey,
      weightKg: biometricsDraft.weightKg,
      waterMl: existingToday?.waterMl || 0,
      energyLevel: existingToday?.energyLevel || 'steady',
      note:
        existingToday?.note ||
        `Calibrated scientific target: ${metabolicResult.targetDailyCalories} kcal/day (${biometricsDraft.weightKg}kg -> ${biometricsDraft.targetWeightKg}kg).`,
      updatedAt: new Date().toISOString(),
    };
    setUserState((prev) => ({
      ...prev,
      userName: nameDraft.trim() || 'Explorer',
      onboardingCompleted: true,
      onboardingCompletedV2: true,
      biometrics: biometricsDraft,
      goals: newGoals,
      dailyJournal: {
        ...(prev.dailyJournal || {}),
        [todayKey]: todayEntry,
      },
    }));
    setShowOnboarding(false);
    setActiveTab('dashboard');
  }

  function handleSaveDailyJournalEntry() {
    const parsedWeight = journalWeightDraft.trim() ? Number(journalWeightDraft) : undefined;
    const existing = userState.dailyJournal?.[selectedJournalDate];
    const entry: DailyJournalEntry = {
      dateKey: selectedJournalDate,
      weightKg: parsedWeight && !Number.isNaN(parsedWeight) ? parsedWeight : undefined,
      waterMl: existing?.waterMl || 0,
      note: journalNoteDraft.trim() || undefined,
      energyLevel: journalEnergyDraft,
      updatedAt: new Date().toISOString(),
    };
    setUserState((prev) => ({
      ...prev,
      biometrics:
        selectedJournalDate === todayKey && entry.weightKg
          ? { ...prev.biometrics, weightKg: entry.weightKg }
          : prev.biometrics,
      dailyJournal: {
        ...(prev.dailyJournal || {}),
        [selectedJournalDate]: entry,
      },
    }));
    if (selectedJournalDate === todayKey && entry.weightKg) {
      setBiometricsDraft((b) => ({ ...b, weightKg: entry.weightKg! }));
    }
    setJournalSavedToast(true);
    setTimeout(() => setJournalSavedToast(false), 2400);
  }

  function handleExportBackup() {
    const jsonStr = exportJournalBackup(userState, meals);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calquest-journal-${todayKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupToast('Journal backup file downloaded.');
    setTimeout(() => setBackupToast(null), 3000);
  }

  function handleImportBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result === 'string') {
          const { userState: restoredState, meals: restoredMeals } = importJournalBackup(
            reader.result
          );
          setUserState(restoredState);
          setMeals(restoredMeals);
          setGoalsDraft(restoredState.goals);
          setBiometricsDraft(restoredState.biometrics);
          if (restoredState.userName) setNameDraft(restoredState.userName);
          setBackupToast(`Restored ${restoredMeals.length} meals and journal history.`);
          setTimeout(() => setBackupToast(null), 3500);
        }
      } catch (err) {
        setBackupToast(
          err instanceof Error ? err.message : 'Could not restore backup file.'
        );
        setTimeout(() => setBackupToast(null), 3500);
      }
    };
    reader.readAsText(file);
  }

  // Smooth progress bar & live stopwatch while analyzing
  useEffect(() => {
    if (!isAnalyzing) return;
    const t0 = Date.now();
    setScanElapsedMs(0);
    const interval = setInterval(() => {
      setScanElapsedMs(Date.now() - t0);
      setScanProgress((prev) => {
        if (prev.stage === 'complete' || prev.percent >= 92) return prev;
        const step = prev.percent < 60 ? 3 : prev.percent < 80 ? 1.5 : 0.6;
        return {
          ...prev,
          percent: Math.min(92, Math.round((prev.percent + step) * 10) / 10),
        };
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  async function runGeminiAnalysisForPhoto(photoUrl: string, noteToUse?: string) {
    if (!photoUrl) return;
    const activeNote = noteToUse !== undefined ? noteToUse : userNote;
    setScanError(null);
    setIsAnalyzing(true);
    setScanProgress({
      stage: 'compressing',
      percent: 12,
      label: 'Optimizing single-tile vision payload',
      detail: '720px fast tile • Minimal thinking latency mode',
    });
    try {
      const mimeMatch = photoUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const result = await analyzeFoodPhotoWithGemini({
        base64Data: photoUrl,
        mimeType,
        userNote: activeNote,
        customInstruction: userState.customPromptInstruction,
        onProgress: (update) => {
          setScanProgress((prev) => ({
            ...update,
            percent: Math.max(prev.percent, update.percent),
          }));
        },
      });

      setAnalysisResult(result);
      setLastAnalyzedNote(activeNote.trim());
      setEditableItems(result.items.map((i) => ({ ...i, included: true })));
      setPortionMultiplier(1);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to analyze meal photo. Check your API key.';
      setScanError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTakePhoto(source: 'camera' | 'gallery') {
    setScanError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await CapCamera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        });
        if (photo.dataUrl) {
          const compressed = await compressImageDataUrl(photo.dataUrl, 720);
          setCapturedPhotoUrl(compressed);
          setAnalysisResult(null);
          if (autoScanOnCapture) {
            void runGeminiAnalysisForPhoto(compressed, userNote);
          }
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('cancel')) {
        fileInputRef.current?.click();
      }
    }
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const compressed = await compressImageDataUrl(reader.result, 720);
        setCapturedPhotoUrl(compressed);
        setAnalysisResult(null);
        if (autoScanOnCapture) {
          void runGeminiAnalysisForPhoto(compressed, userNote);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRunGeminiAnalysis() {
    if (!capturedPhotoUrl) return;
    await runGeminiAnalysisForPhoto(capturedPhotoUrl, userNote);
  }

  function handleConfirmLogMeal() {
    if (!analysisResult || !adjustedAnalysis) return;

    const xpCalc = calculateMealXp(analysisResult.healthScore);
    const newMeal: MealLog = {
      id: `meal_${Date.now()}`,
      timestamp: new Date().toISOString(),
      dateKey: todayKey,
      mealType,
      mealName: analysisResult.mealName,
      emoji: 'utensils',
      totalCalories: adjustedAnalysis.totalCalories,
      macros: adjustedAnalysis.macros,
      items: editableItems
        .filter((i) => i.included !== false)
        .map((i) => ({
          ...i,
          calories: Math.round(i.calories * portionMultiplier),
          proteinGrams: Math.round(i.proteinGrams * portionMultiplier),
          carbsGrams: Math.round(i.carbsGrams * portionMultiplier),
          fatGrams: Math.round(i.fatGrams * portionMultiplier),
        })),
      healthScore: analysisResult.healthScore,
      wittyFeedback: analysisResult.wittyFeedback,
      confidence: analysisResult.confidence,
      photoDataUrl: capturedPhotoUrl || undefined,
      xpEarned: xpCalc.totalXp,
      portionMultiplier,
      userNote: userNote.trim() || undefined,
    };

    const updatedMeals = [newMeal, ...meals];
    const updatedTodayMeals = [newMeal, ...todayMeals];
    const streakInfo = updateStreakOnLog(userState, todayKey);

    const tempStateForBadges: UserState = {
      ...userState,
      streakDays: streakInfo.streakDays,
      longestStreak: streakInfo.longestStreak,
      streakFreezes: streakInfo.streakFreezes,
      lastLoggedDate: todayKey,
    };

    const newlyUnlockedBadges = evaluateNewlyUnlockedBadges(
      updatedMeals,
      updatedTodayMeals,
      tempStateForBadges
    );
    const badgeBonusXp = newlyUnlockedBadges.reduce((s, b) => s + b.xpReward, 0);
    const totalXpEarned = xpCalc.totalXp + badgeBonusXp;

    const prevLevel = getLevelInfo(userState.xp).level;
    const newTotalXp = userState.xp + totalXpEarned;
    const newLevel = getLevelInfo(newTotalXp).level;

    setMeals(updatedMeals);
    setUserState((prev) => ({
      ...prev,
      xp: newTotalXp,
      streakDays: streakInfo.streakDays,
      longestStreak: streakInfo.longestStreak,
      streakFreezes: streakInfo.streakFreezes,
      lastLoggedDate: todayKey,
      unlockedBadgeIds: [
        ...prev.unlockedBadgeIds,
        ...newlyUnlockedBadges.map((b) => b.id),
      ],
    }));

    setCelebrationData({
      xpGained: totalXpEarned,
      newBadges: newlyUnlockedBadges,
      leveledUp: newLevel > prevLevel,
      newLevel,
    });

    setCapturedPhotoUrl(null);
    setAnalysisResult(null);
    setUserNote('');
    setActiveTab('dashboard');
  }

  function handleClaimQuest(questId: string, xpReward: number) {
    const claimedToday = userState.claimedQuestIdsByDate[todayKey] || [];
    if (claimedToday.includes(questId)) return;

    const prevLevel = getLevelInfo(userState.xp).level;
    const newTotalXp = userState.xp + xpReward;
    const newLevel = getLevelInfo(newTotalXp).level;

    setUserState((prev) => ({
      ...prev,
      xp: newTotalXp,
      claimedQuestIdsByDate: {
        ...prev.claimedQuestIdsByDate,
        [todayKey]: [...claimedToday, questId],
      },
    }));

    setCelebrationData({
      xpGained: xpReward,
      newBadges: [],
      leveledUp: newLevel > prevLevel,
      newLevel,
    });
  }

  function handleDeleteMeal(id: string) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  function handleApplyScientificTargets() {
    const newGoals: UserGoals = {
      dailyCalories: metabolicResult.targetDailyCalories,
      proteinGrams: metabolicResult.recommendedMacros.proteinGrams,
      carbsGrams: metabolicResult.recommendedMacros.carbsGrams,
      fatGrams: metabolicResult.recommendedMacros.fatGrams,
      fiberGrams: metabolicResult.recommendedMacros.fiberGrams,
      waterMl: metabolicResult.recommendedWaterMl,
    };
    setGoalsDraft(newGoals);
    setUserState((prev) => ({
      ...prev,
      userName: nameDraft.trim() || prev.userName,
      biometrics: biometricsDraft,
      goals: newGoals,
    }));
    setMathAppliedToast(true);
    setTimeout(() => setMathAppliedToast(false), 2600);
  }

  function handleSaveSettings() {
    setStoredApiKey(apiKeyInput);
    setUserState((prev) => ({
      ...prev,
      userName: nameDraft.trim() || prev.userName,
      biometrics: biometricsDraft,
      goals: {
        dailyCalories: Math.max(800, Number(goalsDraft.dailyCalories) || 2100),
        proteinGrams: Math.max(20, Number(goalsDraft.proteinGrams) || 140),
        carbsGrams: Math.max(20, Number(goalsDraft.carbsGrams) || 220),
        fatGrams: Math.max(15, Number(goalsDraft.fatGrams) || 70),
        fiberGrams: Math.max(10, Number(goalsDraft.fiberGrams) || 30),
        waterMl: Math.max(500, Number(goalsDraft.waterMl) || 2700),
      },
      customPromptInstruction: customPromptDraft,
    }));
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 2500);
  }

  async function handleTestApiConnection() {
    setTestingApi(true);
    setApiTestResult(null);
    setStoredApiKey(apiKeyInput);
    const res = await testGeminiConnection(apiKeyInput);
    setApiTestResult(res);
    setTestingApi(false);
  }

  const caloriePercent = Math.min(
    100,
    Math.round((todayTotals.calories / Math.max(1, userState.goals.dailyCalories)) * 100)
  );
  const caloriesRemaining = userState.goals.dailyCalories - todayTotals.calories;

  // Expressive Thick Rounded Calorie Ring Geometry
  const ringRadius = 68;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringStrokeDashoffset =
    ringCircumference - (caloriePercent / 100) * ringCircumference;

  // ============================================================================
  // FULL-SCREEN SCIENTIFIC & ANTHROPOMETRIC ONBOARDING WIZARD
  // ============================================================================
  if (showOnboarding) {
    return (
      <div className="min-h-[100dvh] bg-m3-surface text-m3-cream flex flex-col justify-between max-w-md mx-auto px-5 py-6 relative overflow-x-hidden">
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-96 max-w-md mx-auto z-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 60% at 50% -10%, rgba(244, 132, 95, 0.24), transparent 70%)',
          }}
        />

        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CalQuestLogoMark className="w-10 h-10" />
              <div>
                <span className="text-base font-display font-extrabold text-m3-cream tracking-tight block leading-none">
                  CalQuest
                </span>
                <span className="text-xs font-mono text-m3-primary">
                  Biomathematical Setup
                </span>
              </div>
            </div>
            {userState.onboardingCompletedV2 && (
              <button
                onClick={() => setShowOnboarding(false)}
                className="px-3.5 py-1.5 rounded-full bg-m3-surfaceContainer text-m3-sand text-xs font-bold border border-white/[0.08]"
              >
                Close
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {[0, 1, 2].map((stepIdx) => (
              <div
                key={stepIdx}
                className={`h-2 rounded-full transition-all duration-500 flex-1 ${
                  stepIdx <= onboardingStep ? 'bg-m3-primary' : 'bg-m3-surfaceHighest'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 my-auto py-4">
          <AnimatePresence mode="wait">
            {/* STEP 1: NAME, SEX, AGE, HEIGHT, WEIGHT, BODY FAT % */}
            {onboardingStep === 0 && (
              <motion.div
                key="onboard-step-0"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-4"
              >
                <OnboardingHeroVector className="w-full h-28" />

                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-bold">
                    Step 1 of 3 • Personal Anthropometrics
                  </span>
                  <h1 className="text-3xl font-display font-extrabold text-m3-cream tracking-tight mt-1">
                    Tell us about yourself.
                  </h1>
                  <p className="text-xs text-m3-sand mt-1 leading-relaxed">
                    Your name, height, weight, age, and sex power the Mifflin-St Jeor (1990) & Katch-McArdle resting metabolic equations.
                  </p>
                </div>

                <div className="rounded-[32px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand mb-1.5">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Enter your name (e.g. Akhand)"
                      className="w-full px-5 py-3.5 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-base font-display font-bold text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand mb-1.5">
                        Biological Sex
                      </label>
                      <div className="p-1 rounded-full bg-m3-surfaceLow border border-white/[0.08] grid grid-cols-2">
                        {(['male', 'female'] as const).map((sex) => (
                          <button
                            key={sex}
                            type="button"
                            onClick={() => setBiometricsDraft((b) => ({ ...b, sex }))}
                            className={`py-2 rounded-full text-xs font-display font-extrabold capitalize transition-all ${
                              biometricsDraft.sex === sex
                                ? 'bg-m3-primary text-m3-surface'
                                : 'text-m3-sand'
                            }`}
                          >
                            {sex}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand mb-1.5">
                        Age (Years)
                      </label>
                      <NumericField
                        value={biometricsDraft.age}
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, age: val }));
                          }
                        }}
                        placeholder="24"
                        className="w-full px-4 py-2.5 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-lg font-mono tabular-nums font-extrabold text-m3-cream text-center"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-m3-sand mb-1">
                        Height (cm)
                      </label>
                      <NumericField
                        value={biometricsDraft.heightCm}
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, heightCm: val }));
                          }
                        }}
                        placeholder="176"
                        className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-lg font-mono tabular-nums font-extrabold text-m3-cream text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-m3-sand mb-1">
                        Weight (kg)
                      </label>
                      <NumericField
                        value={biometricsDraft.weightKg}
                        step="0.5"
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, weightKg: val }));
                          }
                        }}
                        placeholder="76"
                        className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-m3-primary/40 text-lg font-mono tabular-nums font-extrabold text-m3-primary text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-m3-sand mb-1">
                        Body Fat %
                      </label>
                      <NumericField
                        value={biometricsDraft.bodyFatPct}
                        onChangeNumber={(val) =>
                          setBiometricsDraft((b) => ({ ...b, bodyFatPct: val }))
                        }
                        placeholder={`~${metabolicResult.estimatedBodyFatPct}%`}
                        className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-base font-mono tabular-nums font-bold text-m3-cream placeholder-m3-muted text-center"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: GOAL WEIGHT, TIMELINE, RESISTANCE TRAINING & ACTIVITY MULTIPLIER */}
            {onboardingStep === 1 && (
              <motion.div
                key="onboard-step-1"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-4"
              >
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-bold">
                    Step 2 of 3 • Goal & Activity Multiplier
                  </span>
                  <h1 className="text-3xl font-display font-extrabold text-m3-cream tracking-tight mt-1">
                    Set your target trajectory.
                  </h1>
                  <p className="text-xs text-m3-sand mt-1">
                    Forbes (1987) & Hall (Lancet 2011) calculate tissue mobilization and dynamic adaptation across your timeline.
                  </p>
                </div>

                <div className="rounded-[32px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        label: 'Lean Cut',
                        desc: '-6 kg',
                        onClick: () =>
                          setBiometricsDraft((b) => ({
                            ...b,
                            targetWeightKg: Math.max(40, Math.round((b.weightKg - 6) * 2) / 2),
                          })),
                        active: biometricsDraft.targetWeightKg < biometricsDraft.weightKg,
                      },
                      {
                        label: 'Recomp',
                        desc: 'Maintain',
                        onClick: () =>
                          setBiometricsDraft((b) => ({
                            ...b,
                            targetWeightKg: b.weightKg,
                          })),
                        active: biometricsDraft.targetWeightKg === biometricsDraft.weightKg,
                      },
                      {
                        label: 'Lean Build',
                        desc: '+5 kg',
                        onClick: () =>
                          setBiometricsDraft((b) => ({
                            ...b,
                            targetWeightKg: Math.round((b.weightKg + 5) * 2) / 2,
                          })),
                        active: biometricsDraft.targetWeightKg > biometricsDraft.weightKg,
                      },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={preset.onClick}
                        className={`p-3 rounded-[22px] border text-center transition-all ${
                          preset.active
                            ? 'bg-m3-primaryContainer border-m3-primary text-m3-cream'
                            : 'bg-m3-surfaceLow border-white/[0.06] text-m3-sand'
                        }`}
                      >
                        <p className="text-xs font-display font-extrabold">{preset.label}</p>
                        <p className="text-xs font-mono text-m3-primary mt-0.5">{preset.desc}</p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-m3-sand mb-1">
                        Target Weight (kg)
                      </label>
                      <NumericField
                        value={biometricsDraft.targetWeightKg}
                        step="0.5"
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, targetWeightKg: val }));
                          }
                        }}
                        placeholder="70"
                        className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-m3-primary/40 text-xl font-mono tabular-nums font-extrabold text-m3-primary text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-m3-sand mb-1">
                        Timeline (weeks)
                      </label>
                      <NumericField
                        value={biometricsDraft.targetTimelineWeeks}
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({
                              ...b,
                              targetTimelineWeeks: val,
                            }));
                          }
                        }}
                        placeholder="12"
                        className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-xl font-mono tabular-nums font-extrabold text-m3-cream text-center"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setBiometricsDraft((b) => ({
                        ...b,
                        resistanceTraining: !b.resistanceTraining,
                      }))
                    }
                    className={`w-full px-4 py-3 rounded-full border text-xs font-display font-extrabold flex items-center justify-between transition-all ${
                      biometricsDraft.resistanceTraining
                        ? 'bg-m3-primaryContainer border-m3-primary text-m3-onPrimaryContainer'
                        : 'bg-m3-surfaceLow border-white/[0.08] text-m3-sand'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Dumbbell className="w-4 h-4 text-m3-primary" />
                      <span>Resistance Training (Preserves Lean Mass)</span>
                    </span>
                    <span className="font-mono uppercase">
                      {biometricsDraft.resistanceTraining ? 'Active' : 'Off'}
                    </span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand px-1">
                    Physical Activity Level (PAL Multiplier)
                  </label>
                  {(
                    Object.keys(ACTIVITY_LABELS) as Array<BiometricsProfile['activityLevel']>
                  ).map((levelKey) => {
                    const item = ACTIVITY_LABELS[levelKey];
                    const active = biometricsDraft.activityLevel === levelKey;
                    return (
                      <button
                        key={levelKey}
                        type="button"
                        onClick={() =>
                          setBiometricsDraft((b) => ({ ...b, activityLevel: levelKey }))
                        }
                        className={`w-full px-4 py-2.5 rounded-[22px] border text-left flex items-center justify-between transition-all ${
                          active
                            ? 'bg-m3-surfaceHigh border-m3-primary text-m3-cream'
                            : 'bg-m3-surfaceContainer border-white/[0.06] text-m3-sand'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-display font-extrabold">{item.label}</p>
                          <p className="text-xs text-m3-muted">{item.desc}</p>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-m3-primary font-extrabold">
                          ×{item.pal.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 3: MATHEMATICAL & SCIENTIFIC RESULT + OPTIONAL API KEY */}
            {onboardingStep === 2 && (
              <motion.div
                key="onboard-step-2"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-4"
              >
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-bold">
                    Step 3 of 3 • Mathematical Prescription
                  </span>
                  <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                    {nameDraft.trim() ? `${nameDraft.trim()}'s` : 'Your'} Scientific Intake
                  </h1>
                </div>

                <div className="rounded-[34px] bg-m3-primaryContainer border border-m3-primary/40 p-5 text-center space-y-3">
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-onPrimaryContainer/80 block">
                    Hall (Lancet 2011) + Forbes (1987) Daily Target
                  </span>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-5xl font-mono tabular-nums font-extrabold text-m3-cream">
                      {metabolicResult.targetDailyCalories}
                    </span>
                    <span className="text-sm font-mono text-m3-onPrimaryContainer">kcal / day</span>
                  </div>
                  <p className="text-xs font-mono text-m3-onPrimaryContainer/90">
                    {metabolicResult.dailyCalorieDelta === 0
                      ? `Isocaloric Maintenance (${metabolicResult.tdee} kcal TDEE)`
                      : `${metabolicResult.dailyCalorieDelta > 0 ? '+' : ''}${
                          metabolicResult.dailyCalorieDelta
                        } kcal/d delta • ${metabolicResult.weeklyRateKg} kg/week`}
                  </p>

                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {[
                      { label: 'Protein', val: `${metabolicResult.recommendedMacros.proteinGrams}g` },
                      { label: 'Carbs', val: `${metabolicResult.recommendedMacros.carbsGrams}g` },
                      { label: 'Fat', val: `${metabolicResult.recommendedMacros.fatGrams}g` },
                      { label: 'Water', val: `${metabolicResult.recommendedWaterMl}ml` },
                    ].map((m) => (
                      <div key={m.label} className="p-2.5 rounded-2xl bg-black/25">
                        <span className="text-xs text-m3-onPrimaryContainer/70 block">{m.label}</span>
                        <span className="text-sm font-mono tabular-nums font-extrabold text-m3-cream">
                          {m.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.08] p-4 space-y-3">
                  <MetabolicEquationVector className="w-full h-20" />
                  <div className="rounded-2xl bg-m3-surfaceLow border border-white/[0.06] divide-y divide-white/[0.06] text-xs">
                    <div className="px-3.5 py-2 flex justify-between">
                      <span className="text-m3-sand">Mifflin-St Jeor / Katch RMR</span>
                      <span className="font-mono tabular-nums font-bold text-m3-cream">
                        {metabolicResult.activeRmr} kcal/d
                      </span>
                    </div>
                    <div className="px-3.5 py-2 flex justify-between">
                      <span className="text-m3-sand">
                        Maintenance TDEE (×{metabolicResult.pal.toFixed(2)})
                      </span>
                      <span className="font-mono tabular-nums font-bold text-m3-amber">
                        {metabolicResult.tdee} kcal/d
                      </span>
                    </div>
                    <div className="px-3.5 py-2 flex justify-between">
                      <span className="text-m3-sand">Forbes Partitioning (p) & Density</span>
                      <span className="font-mono tabular-nums font-bold text-m3-primarySoft">
                        {metabolicResult.effectiveEnergyDensityKcalPerKg} kcal/kg
                      </span>
                    </div>
                    <div className="px-3.5 py-2 flex justify-between">
                      <span className="text-m3-sand">Hall Adaptation (ε = 22 kcal/kg/d)</span>
                      <span className="font-mono tabular-nums font-bold text-m3-sage">
                        {metabolicResult.metabolicAdaptationKcal >= 0 ? '+' : ''}
                        {metabolicResult.metabolicAdaptationKcal} kcal/d
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.08] p-4 space-y-2.5">
                  <label className="block text-xs font-bold text-m3-sand">
                    Gemini Vision API Key (Optional — can also set in Settings)
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste AIzaSy... key for meal photo analysis"
                    className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-xs font-mono text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative z-10 flex items-center gap-3 pt-2">
          {onboardingStep > 0 && (
            <button
              type="button"
              onClick={() => setOnboardingStep((s) => s - 1)}
              className="p-4 rounded-full bg-m3-surfaceContainer border border-white/[0.08] text-m3-cream active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {onboardingStep < 2 ? (
            <button
              type="button"
              onClick={() => setOnboardingStep((s) => s + 1)}
              className="flex-1 py-4 px-6 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishOnboarding}
              className="flex-1 py-4 px-6 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Save Target & Start Journal</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-m3-surface text-m3-cream flex flex-col max-w-md mx-auto relative overflow-x-hidden selection:bg-m3-primary/30 border-x border-white/[0.04]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-80 max-w-md mx-auto z-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 55% at 50% -15%, rgba(244, 132, 95, 0.18), transparent 70%)',
        }}
      />

      {/* TOP WARM MATERIAL 3 EXPRESSIVE APP BAR WITH BRAND LOGO */}
      <header className="sticky top-0 z-30 backdrop-blur-2xl bg-m3-surface/85 border-b border-white/[0.06] px-4 pt-3.5 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalQuestLogoMark className="w-12 h-12 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono tabular-nums uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-m3-primaryContainer text-m3-onPrimaryContainer border border-m3-primary/25 font-bold">
                  LVL {levelInfo.level}
                </span>
                <span className="text-base font-display font-extrabold text-m3-cream tracking-tight">
                  {userState.userName ? `${userState.userName}` : levelInfo.rankTitle}
                </span>
              </div>
              <div className="w-36 h-2 bg-m3-surfaceHighest rounded-full overflow-hidden mt-1.5">
                <motion.div
                  className="h-full bg-m3-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${levelInfo.progressPercent}%` }}
                  transition={M3_SOFT_SPRING}
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('journal')}
            className="flex items-center gap-2 bg-m3-surfaceContainer border border-white/[0.08] px-4 py-2.5 rounded-full active:scale-95 transition-transform"
          >
            <Flame
              className={`w-5 h-5 ${
                userState.streakDays > 0 ? 'text-m3-amber' : 'text-m3-muted'
              }`}
            />
            <div className="leading-none text-left">
              <span className="text-sm font-mono tabular-nums font-extrabold text-m3-cream">
                {userState.streakDays}d
              </span>
              <span className="text-xs text-m3-sand block">streak</span>
            </div>
          </button>
        </div>
      </header>

      {/* MAIN SCROLLABLE VIEWPORT */}
      <main className="flex-1 px-4 pt-4 pb-32 relative z-10">
        {!hasApiKeyConfigured && activeTab !== 'settings' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={M3_SPRING}
            className="mb-4 p-4 rounded-[30px] bg-m3-surfaceContainer border border-m3-amber/30 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-m3-amber/15 border border-m3-amber/30 flex items-center justify-center text-m3-amber shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-display font-bold text-m3-cream">
                  Add Vision API Key
                </p>
                <p className="text-xs text-m3-sand">
                  Connect your key in Settings for instant photo calorie scans.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-4 py-2 rounded-full bg-m3-amber text-m3-surface text-xs font-display font-extrabold shrink-0 active:scale-95 transition-transform"
            >
              Setup
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* TAB 1: TODAY DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* EXPRESSIVE OVERSIZED CALORIE & MACRO CARD */}
              <section className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                      Today's Energy Budget
                    </span>
                    <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                      Metabolic Pulse
                    </h1>
                  </div>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="inline-flex items-center gap-1.5 text-xs font-display font-bold px-3.5 py-2 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-m3-cream border border-white/[0.08] active:scale-95 transition-all"
                  >
                    <Calculator className="w-3.5 h-3.5 text-m3-primary" />
                    <span>Body Math</span>
                  </button>
                </div>

                {/* Big Texted Hero Ring + Remaining Readout */}
                <div className="flex items-center gap-5">
                  <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                      <circle
                        cx="80"
                        cy="80"
                        r={ringRadius}
                        stroke="rgba(255, 255, 255, 0.07)"
                        strokeWidth="15"
                        fill="transparent"
                      />
                      <motion.circle
                        cx="80"
                        cy="80"
                        r={ringRadius}
                        stroke={caloriesRemaining >= 0 ? '#F4845F' : '#E56B6F'}
                        strokeWidth="15"
                        strokeDasharray={ringCircumference}
                        initial={{ strokeDashoffset: ringCircumference }}
                        animate={{ strokeDashoffset: ringStrokeDashoffset }}
                        transition={M3_SOFT_SPRING}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                      <span className="text-xs uppercase tracking-wider text-m3-sand font-semibold">
                        {caloriesRemaining >= 0 ? 'Left' : 'Over'}
                      </span>
                      <span className="text-4xl font-mono tabular-nums font-extrabold text-m3-cream tracking-tight mt-0.5">
                        {Math.abs(caloriesRemaining)}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-m3-muted mt-0.5">
                        / {userState.goals.dailyCalories}
                      </span>
                    </div>
                  </div>

                  {/* Smooth Rounded Macro Capsules */}
                  <div className="flex-1 space-y-3.5">
                    {[
                      {
                        label: 'Protein',
                        current: todayTotals.protein,
                        target: userState.goals.proteinGrams,
                        barClass: 'bg-m3-primary',
                        textClass: 'text-m3-primarySoft',
                      },
                      {
                        label: 'Carbs',
                        current: todayTotals.carbs,
                        target: userState.goals.carbsGrams,
                        barClass: 'bg-m3-amber',
                        textClass: 'text-m3-amber',
                      },
                      {
                        label: 'Fat',
                        current: todayTotals.fat,
                        target: userState.goals.fatGrams,
                        barClass: 'bg-m3-rose',
                        textClass: 'text-m3-rose',
                      },
                      {
                        label: 'Fiber',
                        current: todayTotals.fiber,
                        target: userState.goals.fiberGrams,
                        barClass: 'bg-m3-sage',
                        textClass: 'text-m3-sage',
                      },
                    ].map((macro) => {
                      const pct = Math.min(
                        100,
                        Math.round((macro.current / Math.max(1, macro.target)) * 100)
                      );
                      return (
                        <div key={macro.label}>
                          <div className="flex justify-between items-baseline text-xs mb-1">
                            <span className="text-m3-cream font-display font-bold">
                              {macro.label}
                            </span>
                            <span className={`font-mono tabular-nums font-bold ${macro.textClass}`}>
                              {macro.current}g{' '}
                              <span className="text-m3-muted font-normal">/ {macro.target}g</span>
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-m3-surfaceLow rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full ${macro.barClass} rounded-full`}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={M3_SOFT_SPRING}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Big Stat Pills */}
                <div className="mt-6 pt-4 border-t border-white/[0.07] grid grid-cols-3 gap-2.5">
                  <div className="rounded-[22px] bg-m3-surfaceLow px-3.5 py-2.5">
                    <span className="text-xs text-m3-muted block">Eaten</span>
                    <span className="text-lg font-mono tabular-nums font-extrabold text-m3-cream">
                      {todayTotals.calories}
                    </span>
                  </div>
                  <div className="rounded-[22px] bg-m3-surfaceLow px-3.5 py-2.5">
                    <span className="text-xs text-m3-muted block">Water</span>
                    <span className="text-lg font-mono tabular-nums font-extrabold text-m3-sage">
                      {todayWaterMl}ml
                    </span>
                  </div>
                  <div className="rounded-[22px] bg-m3-surfaceLow px-3.5 py-2.5">
                    <span className="text-xs text-m3-muted block">Weight</span>
                    <span className="text-lg font-mono tabular-nums font-extrabold text-m3-primarySoft">
                      {userState.dailyJournal?.[todayKey]?.weightKg ??
                        userState.biometrics.weightKg}
                      kg
                    </span>
                  </div>
                </div>
              </section>

              {/* PRIMARY ACTION ROW: SNAP PHOTO + FREQUENT / QUICK ADD */}
              <div className="grid grid-cols-12 gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveTab('scan')}
                  className="col-span-8 p-4 rounded-[32px] bg-m3-primary hover:bg-m3-primarySoft text-m3-surface flex items-center justify-between shadow-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-m3-surface text-m3-primary flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-base font-display font-extrabold tracking-tight">
                        Snap Meal Photo
                      </h2>
                      <p className="text-xs font-medium text-m3-surface/80">
                        AI Vision Scan (+XP)
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setQuickAddModalDate(todayKey)}
                  className="col-span-4 p-4 rounded-[32px] bg-m3-surfaceContainer hover:bg-m3-surfaceHigh border border-m3-primary/30 text-m3-cream flex flex-col items-center justify-center text-center gap-1"
                >
                  <Repeat className="w-5 h-5 text-m3-primary" />
                  <span className="text-xs font-display font-extrabold leading-tight">
                    Frequent / Quick Add
                  </span>
                </motion.button>
              </div>

              {/* 1-TAP REPETITIVE MEALS STRIP (IF USER HAS PREVIOUS OR SAVED MEALS) */}
              {frequentMealsList.length > 0 && (
                <section className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.07] p-4 space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-m3-primary" />
                      <span className="text-xs font-display font-extrabold uppercase tracking-wider text-m3-sand">
                        1-Tap Repetitive Meals
                      </span>
                    </div>
                    <button
                      onClick={() => setQuickAddModalDate(todayKey)}
                      className="text-xs font-display font-bold text-m3-primary hover:underline"
                    >
                      View All / + Custom
                    </button>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {frequentMealsList.slice(0, 6).map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() =>
                          handleQuickLogTemplate(
                            {
                              mealName: tpl.mealName,
                              mealType: tpl.mealType,
                              totalCalories: tpl.totalCalories,
                              macros: tpl.macros,
                              healthScore: tpl.healthScore,
                            },
                            false,
                            todayKey
                          )
                        }
                        className="px-3.5 py-2.5 rounded-[22px] bg-m3-surfaceLow hover:bg-m3-surfaceHigh border border-white/[0.07] shrink-0 text-left flex items-center gap-2.5 active:scale-95 transition-all"
                      >
                        <div>
                          <p className="text-xs font-display font-bold text-m3-cream max-w-[140px] truncate">
                            {tpl.mealName}
                          </p>
                          <p className="text-xs font-mono text-m3-primary font-bold">
                            +{tpl.totalCalories} kcal • P {tpl.macros.proteinGrams}g
                          </p>
                        </div>
                        <div className="w-7 h-7 rounded-full bg-m3-primary/20 text-m3-primary flex items-center justify-center">
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* WATER / HYDRATION TRACKER CARD (GLASS 250ML, BOTTLE 500ML, LARGE 750ML, CUSTOM) */}
              <HydrationTrackerCard
                dateLabel="Today"
                currentWaterMl={todayWaterMl}
                targetWaterMl={userState.goals.waterMl || 2700}
                onAddWater={(delta) => updateWaterForDate(todayKey, todayWaterMl + delta)}
                onSetWater={(exact) => updateWaterForDate(todayKey, exact)}
              />

              {/* TODAY'S MEAL TIMELINE WITH EDIT & DELETE */}
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-lg font-display font-extrabold text-m3-cream">
                    Today's Plate Log ({todayMeals.length})
                  </h2>
                  <button
                    onClick={() => setActiveTab('journal')}
                    className="text-xs font-display font-bold text-m3-primary hover:underline"
                  >
                    Past Days Journal
                  </button>
                </div>

                {todayMeals.length === 0 ? (
                  <div className="rounded-[34px] bg-m3-surfaceContainer border border-white/[0.07] p-7 text-center">
                    <EmptyPlateVector className="w-28 h-24 mx-auto mb-2" />
                    <p className="text-base font-display font-bold text-m3-cream">
                      Your plate journal is empty today
                    </p>
                    <p className="text-xs text-m3-sand mt-1 max-w-xs mx-auto leading-relaxed">
                      Snap a meal photo or use "Frequent / Quick Add" above to log your food.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayMeals.map((meal) => (
                      <motion.div
                        key={meal.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.08] p-4 flex gap-3.5 items-center"
                      >
                        {meal.photoDataUrl ? (
                          <img
                            src={meal.photoDataUrl}
                            alt={meal.mealName}
                            className="w-16 h-16 rounded-[20px] object-cover shrink-0 border border-white/[0.1]"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-[20px] bg-m3-surfaceHigh flex items-center justify-center text-m3-primary shrink-0 border border-white/[0.08]">
                            <RenderVectorIcon name={meal.mealType} className="w-6 h-6" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-m3-surfaceHigh text-m3-sand font-bold">
                              {meal.mealType}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-m3-primary font-bold">
                              {meal.totalCalories} kcal
                            </span>
                          </div>
                          <h3 className="text-base font-display font-extrabold text-m3-cream truncate mt-1">
                            {meal.mealName}
                          </h3>
                          <div className="flex items-center gap-2.5 mt-1 text-xs font-mono tabular-nums">
                            <span className="text-m3-primarySoft">P {meal.macros.proteinGrams}g</span>
                            <span className="text-m3-amber">C {meal.macros.carbsGrams}g</span>
                            <span className="text-m3-rose">F {meal.macros.fatGrams}g</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setEditingMeal(meal)}
                            className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-sand hover:text-m3-primary transition-colors"
                            title="Edit meal"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteMeal(meal.id)}
                            className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-muted hover:text-m3-rose transition-colors"
                            title="Delete meal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* TAB 2: MULTI-DAY JOURNAL & HISTORY (WITH EDITING, QUICK ADD & HYDRATION) */}
          {activeTab === 'journal' && (
            <motion.div
              key="journal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* 7-DAY TREND & ADHERENCE OVERVIEW */}
              <section className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                      Past 7 Days Trajectory
                    </span>
                    <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                      Metabolic Journal
                    </h1>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-mono tabular-nums font-extrabold text-m3-primary">
                      {journal7DayStats.avgCalories || '—'}
                    </span>
                    <span className="text-xs text-m3-sand block">7d avg kcal</span>
                  </div>
                </div>

                {/* 7-Day Rounded Bar Chart */}
                <div className="pt-2">
                  <div className="grid grid-cols-7 gap-2 items-end h-32 px-1">
                    {journal7DayStats.daySummaries.map((d) => {
                      const maxCal = Math.max(userState.goals.dailyCalories * 1.25, 2600);
                      const heightPct =
                        d.calories > 0
                          ? Math.min(100, Math.max(14, Math.round((d.calories / maxCal) * 100)))
                          : 10;
                      const isSelected = d.dateKey === selectedJournalDate;
                      const inZone =
                        d.calories >= userState.goals.dailyCalories * 0.8 &&
                        d.calories <= userState.goals.dailyCalories * 1.1;

                      return (
                        <button
                          key={d.dateKey}
                          onClick={() => setSelectedJournalDate(d.dateKey)}
                          className="flex flex-col items-center justify-end h-full group"
                        >
                          <span className="text-xs font-mono tabular-nums text-m3-sand mb-1">
                            {d.calories > 0 ? Math.round(d.calories / 100) / 10 + 'k' : '—'}
                          </span>
                          <div className="w-full h-24 bg-m3-surfaceLow rounded-full p-1 flex items-end">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${heightPct}%` }}
                              transition={M3_SOFT_SPRING}
                              className={`w-full rounded-full transition-colors ${
                                d.calories === 0
                                  ? 'bg-m3-surfaceHighest'
                                  : inZone
                                  ? 'bg-m3-primary'
                                  : 'bg-m3-amber'
                              } ${isSelected ? 'ring-2 ring-m3-cream' : ''}`}
                            />
                          </div>
                          <span
                            className={`text-xs font-display mt-1.5 ${
                              isSelected
                                ? 'text-m3-primary font-extrabold'
                                : 'text-m3-sand font-medium'
                            }`}
                          >
                            {d.dayShort}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 14-Day Scrollable Date Pill Scrubber */}
                <div>
                  <div className="flex items-center justify-between text-xs text-m3-sand mb-2">
                    <span className="font-display font-bold uppercase tracking-wider">
                      Browse Past 14 Days
                    </span>
                    <input
                      type="date"
                      value={selectedJournalDate}
                      max={todayKey}
                      onChange={(e) => {
                        if (e.target.value) setSelectedJournalDate(e.target.value);
                      }}
                      className="px-3 py-1 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-xs font-mono text-m3-cream"
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {past14Days.map((d) => {
                      const active = d.dateKey === selectedJournalDate;
                      const hasMeals = meals.some((m) => m.dateKey === d.dateKey);
                      const hasJournal = Boolean(userState.dailyJournal?.[d.dateKey]);
                      return (
                        <button
                          key={d.dateKey}
                          onClick={() => setSelectedJournalDate(d.dateKey)}
                          className={`px-3.5 py-2.5 rounded-[22px] border shrink-0 flex flex-col items-center min-w-[60px] transition-all ${
                            active
                              ? 'bg-m3-primary border-m3-primary text-m3-surface'
                              : 'bg-m3-surfaceLow border-white/[0.06] text-m3-sand'
                          }`}
                        >
                          <span className="text-xs font-medium opacity-80">{d.dayShort}</span>
                          <span className="text-lg font-mono tabular-nums font-extrabold mt-0.5">
                            {d.dayNum}
                          </span>
                          <div className="flex gap-1 mt-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                hasMeals
                                  ? active
                                    ? 'bg-m3-surface'
                                    : 'bg-m3-primary'
                                  : 'bg-transparent'
                              }`}
                            />
                            {hasJournal && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  active ? 'bg-m3-surface' : 'bg-m3-amber'
                                }`}
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* WATER INTAKE FOR SELECTED JOURNAL DATE */}
              <HydrationTrackerCard
                dateLabel={selectedJournalDate === todayKey ? 'Today' : selectedJournalDate}
                currentWaterMl={selectedDateWaterMl}
                targetWaterMl={userState.goals.waterMl || 2700}
                onAddWater={(delta) =>
                  updateWaterForDate(selectedJournalDate, selectedDateWaterMl + delta)
                }
                onSetWater={(exact) => updateWaterForDate(selectedJournalDate, exact)}
              />

              {/* SELECTED DAY SUMMARY + WEIGHT & REFLECTION CHECK-IN */}
              <section className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-5 h-5 text-m3-primary" />
                    <div>
                      <h2 className="text-lg font-display font-extrabold text-m3-cream">
                        {selectedJournalDate === todayKey ? 'Today' : selectedJournalDate}
                      </h2>
                      <p className="text-xs text-m3-sand">
                        {selectedDateMeals.length} meals • P {selectedDateTotals.protein}g •{' '}
                        {selectedDateWaterMl}ml water
                      </p>
                    </div>
                  </div>
                  <span className="text-xl font-mono tabular-nums font-extrabold text-m3-primary">
                    {selectedDateTotals.calories} kcal
                  </span>
                </div>

                {/* Morning Weight & Energy Level Check-In */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-m3-sand mb-1.5">
                      Body Weight Check-In (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={journalWeightDraft}
                      onChange={(e) => setJournalWeightDraft(e.target.value)}
                      placeholder={`${userState.biometrics.weightKg} kg`}
                      className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream placeholder-m3-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-m3-sand mb-1.5">
                      Daily Energy Feel
                    </label>
                    <div className="p-1 rounded-full bg-m3-surfaceLow border border-white/[0.08] grid grid-cols-3">
                      {(['low', 'steady', 'peak'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setJournalEnergyDraft(lvl)}
                          className={`py-2 rounded-full text-xs font-display font-bold capitalize transition-all ${
                            journalEnergyDraft === lvl
                              ? 'bg-m3-primary text-m3-surface'
                              : 'text-m3-sand'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-m3-sand mb-1.5">
                    Daily Journal Note (Training, hunger, digestion, sleep)
                  </label>
                  <textarea
                    rows={2}
                    value={journalNoteDraft}
                    onChange={(e) => setJournalNoteDraft(e.target.value)}
                    placeholder="Write how your day went, workout performance, or nutrition notes..."
                    className="w-full px-4 py-3 rounded-[24px] bg-m3-surfaceLow border border-white/[0.08] text-sm text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                  />
                </div>

                <button
                  onClick={handleSaveDailyJournalEntry}
                  className="w-full py-3.5 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Save Entry for {selectedJournalDate}</span>
                </button>

                {journalSavedToast && (
                  <p className="text-xs text-m3-primary font-bold text-center">
                    Journal entry saved to on-device database.
                  </p>
                )}
              </section>

              {/* MEALS LOGGED ON SELECTED DATE (WITH EDIT, DELETE & ADD TO THIS DATE) */}
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-base font-display font-extrabold text-m3-cream">
                    Meals on {selectedJournalDate} ({selectedDateMeals.length})
                  </h3>
                  <button
                    onClick={() => setQuickAddModalDate(selectedJournalDate)}
                    className="px-3.5 py-1.5 rounded-full bg-m3-primaryContainer border border-m3-primary/35 text-m3-onPrimaryContainer text-xs font-display font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-m3-primary" />
                    <span>Add Food to Date</span>
                  </button>
                </div>

                {selectedDateMeals.length === 0 ? (
                  <div className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.07] p-6 text-center text-xs text-m3-sand">
                    No meals recorded on {selectedJournalDate}. Tap "Add Food to Date" to log a meal for this day.
                  </div>
                ) : (
                  selectedDateMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.08] p-4 flex gap-3.5 items-center"
                    >
                      {meal.photoDataUrl ? (
                        <img
                          src={meal.photoDataUrl}
                          alt={meal.mealName}
                          className="w-16 h-16 rounded-[20px] object-cover shrink-0 border border-white/[0.1]"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-[20px] bg-m3-surfaceHigh flex items-center justify-center text-m3-primary shrink-0">
                          <RenderVectorIcon name={meal.mealType} className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs uppercase font-bold text-m3-primary">
                          {meal.mealType}
                        </span>
                        <h4 className="text-base font-display font-bold text-m3-cream truncate">
                          {meal.mealName}
                        </h4>
                        <p className="text-xs font-mono tabular-nums text-m3-sand mt-0.5">
                          {meal.totalCalories} kcal • P {meal.macros.proteinGrams}g • C{' '}
                          {meal.macros.carbsGrams}g • F {meal.macros.fatGrams}g
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setEditingMeal(meal)}
                          className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-sand hover:text-m3-primary transition-colors"
                          title="Edit meal"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMeal(meal.id)}
                          className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-muted hover:text-m3-rose transition-colors"
                          title="Delete meal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </motion.div>
          )}

          {/* TAB 3: SCAN & MULTIMODAL VISION */}
          {activeTab === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                      Turbo Vision • Minimal Thinking
                    </span>
                    <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                      Visual Plate Scanner
                    </h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAutoScanOnCapture((v) => !v)}
                      className={`px-3 py-2 rounded-full border text-xs font-display font-bold flex items-center gap-1.5 transition-colors ${
                        autoScanOnCapture
                          ? 'bg-m3-primaryContainer border-m3-primary/40 text-m3-onPrimaryContainer'
                          : 'bg-m3-surfaceHigh border-white/[0.08] text-m3-sand'
                      }`}
                      title="Automatically start AI analysis as soon as a photo is captured"
                    >
                      <Zap className="w-3.5 h-3.5 text-m3-primary" />
                      <span>Instant: {autoScanOnCapture ? 'ON' : 'OFF'}</span>
                    </button>
                    <button
                      onClick={() => setQuickAddModalDate(todayKey)}
                      className="px-3.5 py-2 rounded-full bg-m3-surfaceHigh text-m3-cream border border-white/[0.08] text-xs font-display font-bold flex items-center gap-1.5"
                    >
                      <Repeat className="w-3.5 h-3.5 text-m3-primary" />
                      <span>Frequent</span>
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {/* Segmented Meal Type Bar */}
                <div className="grid grid-cols-4 gap-1.5 mt-5 p-1.5 rounded-full bg-m3-surfaceLow border border-white/[0.06]">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((type) => {
                    const active = mealType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setMealType(type)}
                        className={`relative py-2.5 rounded-full text-xs font-display font-bold capitalize transition-colors z-10 flex items-center justify-center gap-1.5 ${
                          active ? 'text-m3-surface' : 'text-m3-sand hover:text-m3-cream'
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="m3-meal-type-pill"
                            transition={M3_SPRING}
                            className="absolute inset-0 rounded-full bg-m3-primary -z-10"
                          />
                        )}
                        <RenderVectorIcon name={type} className="w-3.5 h-3.5" />
                        <span>{type}</span>
                      </button>
                    );
                  })}
                </div>

                {!capturedPhotoUrl ? (
                  <div className="mt-5 border border-dashed border-white/[0.15] rounded-[32px] p-7 text-center bg-m3-surfaceLow">
                    <ScannerViewfinderVector className="w-28 h-24 mx-auto mb-2" />
                    <p className="text-lg font-display font-extrabold text-m3-cream mb-1">
                      Capture Your Meal
                    </p>
                    <p className="text-xs text-m3-sand mb-6 max-w-xs mx-auto leading-relaxed">
                      Keep the full plate or bowl in frame. Single-tile 720px compression and cached Flash routing deliver fast macro breakdowns.
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => handleTakePhoto('camera')}
                        className="px-6 py-3.5 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-sm flex items-center gap-2 active:scale-95 transition-all"
                      >
                        <Camera className="w-4 h-4" />
                        Camera
                      </button>
                      <button
                        onClick={() => handleTakePhoto('gallery')}
                        className="px-6 py-3.5 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-m3-cream border border-white/[0.08] font-display font-bold text-sm flex items-center gap-2 active:scale-95 transition-all"
                      >
                        <ImageIcon className="w-4 h-4" />
                        Gallery
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="relative rounded-[28px] overflow-hidden border border-white/[0.1] bg-black">
                      <img
                        src={capturedPhotoUrl}
                        alt="Captured meal"
                        className="w-full max-h-64 object-cover"
                      />
                      <button
                        onClick={() => {
                          setCapturedPhotoUrl(null);
                          setAnalysisResult(null);
                          setScanError(null);
                        }}
                        className="absolute top-3 right-3 p-2.5 rounded-full bg-black/75 text-white hover:bg-black border border-white/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-m3-sand mb-1.5">
                        Optional Context Note (e.g. cooked in 1 tbsp ghee, double chicken)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={userNote}
                          onChange={(e) => setUserNote(e.target.value)}
                          placeholder="Add preparation details or hidden ingredients..."
                          className="flex-1 px-4 py-3.5 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-sm text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                        />
                        {analysisResult &&
                          !isAnalyzing &&
                          userNote.trim() !== lastAnalyzedNote && (
                            <button
                              onClick={handleRunGeminiAnalysis}
                              className="px-4 py-3 rounded-full bg-m3-primary text-m3-surface font-display font-extrabold text-xs shrink-0 flex items-center gap-1.5 active:scale-95 transition-transform"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Re-Run
                            </button>
                          )}
                      </div>
                    </div>

                    {/* LIVE MULTI-STAGE VISION PROGRESS TRACKER */}
                    {isAnalyzing && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-5 rounded-[28px] bg-m3-surfaceLow border border-m3-primary/35 space-y-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-2xl bg-m3-primaryContainer border border-m3-primary/35 flex items-center justify-center shrink-0">
                              <Loader2 className="w-4 h-4 text-m3-primary animate-spin" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-display font-extrabold text-m3-cream truncate">
                                {scanProgress.label}
                              </p>
                              <p className="text-xs font-mono text-m3-sand truncate">
                                {scanProgress.detail || 'Streaming structured nutrition schema...'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-base font-mono tabular-nums font-extrabold text-m3-primary block">
                              {Math.round(scanProgress.percent)}%
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-m3-muted block">
                              {(scanElapsedMs / 1000).toFixed(1)}s
                            </span>
                          </div>
                        </div>

                        {/* Smooth Animated Progress Bar */}
                        <div className="w-full h-2.5 rounded-full bg-m3-surfaceContainer overflow-hidden border border-white/[0.05]">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-m3-primary via-m3-primarySoft to-m3-amber"
                            initial={{ width: '8%' }}
                            animate={{ width: `${Math.max(8, Math.min(100, scanProgress.percent))}%` }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                          />
                        </div>

                        {/* 4-Stage Pipeline Checklist */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {[
                            {
                              id: 'compressing',
                              title: scanProgress.payloadKb
                                ? `Single-Tile (${scanProgress.payloadKb} KB)`
                                : 'Single-Tile 720px',
                              threshold: 10,
                            },
                            {
                              id: 'connecting',
                              title: scanProgress.activeModel
                                ? scanProgress.activeModel.replace(/^gemini-/, '')
                                : 'Fast Flash Route',
                              threshold: 25,
                            },
                            {
                              id: 'vision',
                              title: 'Portion Geometry',
                              threshold: 45,
                            },
                            {
                              id: 'macros',
                              title: 'Macro Synthesis',
                              threshold: 82,
                            },
                          ].map((step) => {
                            const done = scanProgress.percent >= step.threshold + 18;
                            const active =
                              !done && scanProgress.percent >= step.threshold - 5;
                            return (
                              <div
                                key={step.id}
                                className={`px-3 py-2 rounded-2xl border flex items-center gap-2 text-xs font-mono transition-colors ${
                                  done
                                    ? 'bg-m3-primaryContainer/55 border-m3-primary/30 text-m3-cream'
                                    : active
                                    ? 'bg-m3-surfaceHigh border-m3-primary/40 text-m3-primarySoft font-bold'
                                    : 'bg-m3-surfaceContainer/60 border-white/[0.04] text-m3-muted'
                                }`}
                              >
                                {done ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-m3-primary shrink-0" />
                                ) : active ? (
                                  <Loader2 className="w-3.5 h-3.5 text-m3-primary animate-spin shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                                )}
                                <span className="truncate">{step.title}</span>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {!analysisResult && !isAnalyzing && (
                      <button
                        onClick={handleRunGeminiAnalysis}
                        className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                      >
                        <Sparkles className="w-5 h-5" />
                        Calculate Calories & Macros
                      </button>
                    )}
                  </div>
                )}

                {scanError && (
                  <div className="mt-4 p-4 rounded-[24px] bg-m3-rose/15 border border-m3-rose/35 flex items-start gap-3 text-m3-cream text-xs">
                    <AlertCircle className="w-5 h-5 text-m3-rose shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-display font-bold text-sm">Analysis Error</p>
                      <p className="text-m3-sand mt-0.5">{scanError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* AI STRUCTURED BREAKDOWN CARD */}
              {analysisResult && adjustedAnalysis && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={M3_SPRING}
                  className="rounded-[36px] bg-m3-surfaceContainer border border-m3-primary/35 p-6 space-y-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-mono uppercase tracking-wider px-3 py-0.5 rounded-full bg-m3-primaryContainer text-m3-onPrimaryContainer border border-m3-primary/25 font-bold">
                          Score {analysisResult.healthScore}/100
                        </span>
                        <span className="text-xs font-mono uppercase tracking-wider px-3 py-0.5 rounded-full bg-m3-surfaceHigh text-m3-sand">
                          {analysisResult.confidence}
                        </span>
                        {analysisResult.latencyMs !== undefined && (
                          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-m3-surfaceLow border border-white/[0.07] text-m3-primarySoft">
                            {(analysisResult.latencyMs / 1000).toFixed(1)}s
                            {analysisResult.modelUsed
                              ? ` • ${analysisResult.modelUsed.replace(/^gemini-/, '')}`
                              : ''}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-display font-extrabold text-m3-cream mt-2">
                        {analysisResult.mealName}
                      </h3>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-3xl font-mono tabular-nums font-extrabold text-m3-primary">
                        {adjustedAnalysis.totalCalories}
                      </span>
                      <span className="text-xs font-mono uppercase text-m3-sand block">
                        kcal
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-[24px] bg-m3-surfaceLow border border-white/[0.06] text-xs text-m3-sand leading-relaxed">
                    {analysisResult.wittyFeedback}
                  </div>

                  <div className="grid grid-cols-4 gap-2.5">
                    {[
                      {
                        label: 'Protein',
                        val: `${adjustedAnalysis.macros.proteinGrams}g`,
                        color: 'text-m3-primarySoft',
                      },
                      {
                        label: 'Carbs',
                        val: `${adjustedAnalysis.macros.carbsGrams}g`,
                        color: 'text-m3-amber',
                      },
                      {
                        label: 'Fat',
                        val: `${adjustedAnalysis.macros.fatGrams}g`,
                        color: 'text-m3-rose',
                      },
                      {
                        label: 'Fiber',
                        val: `${adjustedAnalysis.macros.fiberGrams}g`,
                        color: 'text-m3-sage',
                      },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="p-3 rounded-[22px] bg-m3-surfaceLow border border-white/[0.05] text-center"
                      >
                        <span className="text-xs text-m3-muted block">{m.label}</span>
                        <span className={`text-base font-mono tabular-nums font-extrabold ${m.color}`}>
                          {m.val}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-[24px] bg-m3-surfaceLow border border-white/[0.05]">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-m3-sand font-bold">Portion Scale</span>
                      <span className="font-mono tabular-nums text-m3-primary font-extrabold">
                        {Math.round(portionMultiplier * 100)}% ({portionMultiplier}x)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.25"
                      value={portionMultiplier}
                      onChange={(e) => setPortionMultiplier(parseFloat(e.target.value))}
                      className="w-full accent-[#F4845F]"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-display font-bold uppercase tracking-wider text-m3-sand mb-2">
                      Detected Plate Items (Tap to toggle)
                    </p>
                    <div className="rounded-[24px] bg-m3-surfaceLow border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
                      {editableItems.map((item, idx) => {
                        const included = item.included !== false;
                        return (
                          <button
                            key={idx}
                            onClick={() =>
                              setEditableItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, included: !included } : it
                                )
                              )
                            }
                            className={`w-full px-4 py-3 flex items-center justify-between text-left transition-opacity ${
                              included ? 'opacity-100' : 'opacity-40'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                                  included
                                    ? 'bg-m3-primary border-m3-primary text-m3-surface'
                                    : 'border-m3-muted'
                                }`}
                              >
                                {included && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div className="truncate">
                                <p className="text-sm font-bold text-m3-cream truncate">
                                  {item.name}
                                </p>
                                <p className="text-xs font-mono text-m3-muted">
                                  {item.portionEstimate} • P {item.proteinGrams}g • C{' '}
                                  {item.carbsGrams}g • F {item.fatGrams}g
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-mono tabular-nums font-bold text-m3-cream shrink-0 ml-2">
                              {Math.round(item.calories * portionMultiplier)} kcal
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmLogMeal}
                    className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                    Save to Today's Journal (+{calculateMealXp(analysisResult.healthScore).totalXp} XP)
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* TAB 4: QUESTS, RANKS & ACHIEVEMENT BADGES */}
          {activeTab === 'quests' && (
            <motion.div
              key="quests"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              <section className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                      Daily Consistency
                    </span>
                    <h1 className="text-2xl font-display font-extrabold text-m3-cream">
                      Today's Quests
                    </h1>
                  </div>
                  <span className="text-sm font-mono tabular-nums font-bold text-m3-amber">
                    {userState.xp} XP
                  </span>
                </div>

                <div className="divide-y divide-white/[0.07]">
                  {dailyQuests.map((q) => {
                    const claimed = (
                      userState.claimedQuestIdsByDate[todayKey] || []
                    ).includes(q.id);
                    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                    return (
                      <div
                        key={q.id}
                        className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-11 h-11 rounded-[18px] flex items-center justify-center shrink-0 border ${
                              q.completed
                                ? 'bg-m3-primaryContainer border-m3-primary/35 text-m3-primary'
                                : 'bg-m3-surfaceHigh border-white/[0.06] text-m3-muted'
                            }`}
                          >
                            <RenderVectorIcon name={q.icon} className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-display font-bold text-m3-cream truncate">
                                {q.title}
                              </p>
                              <span className="text-xs font-mono tabular-nums text-m3-primary font-bold shrink-0">
                                +{q.xpReward} XP
                              </span>
                            </div>
                            <p className="text-xs text-m3-sand truncate">{q.description}</p>
                            <div className="w-full h-1.5 bg-m3-surfaceLow rounded-full overflow-hidden mt-2">
                              <motion.div
                                className="h-full bg-m3-primary rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={M3_SOFT_SPRING}
                              />
                            </div>
                          </div>
                        </div>

                        {q.completed && !claimed ? (
                          <button
                            onClick={() => handleClaimQuest(q.id, q.xpReward)}
                            className="px-4 py-2 rounded-full bg-m3-primary text-m3-surface font-display font-extrabold text-xs shrink-0 active:scale-95 transition-transform"
                          >
                            Claim
                          </button>
                        ) : claimed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-m3-primary font-bold shrink-0">
                            <Check className="w-4 h-4" /> Done
                          </span>
                        ) : (
                          <span className="text-xs font-mono tabular-nums text-m3-muted shrink-0">
                            {q.progress}/{q.target}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-m3-amber" />
                    <h2 className="text-lg font-display font-extrabold text-m3-cream">
                      Milestones & Badges
                    </h2>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-m3-sand">
                    {userState.unlockedBadgeIds.length} / {ALL_BADGES.length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {ALL_BADGES.map((badge) => {
                    const unlocked = userState.unlockedBadgeIds.includes(badge.id);
                    return (
                      <div
                        key={badge.id}
                        className={`p-4 rounded-[26px] border transition-all ${
                          unlocked
                            ? 'bg-m3-primaryContainer/70 border-m3-primary/35 text-m3-cream'
                            : 'bg-m3-surfaceLow border-white/[0.05] text-m3-muted opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                              unlocked
                                ? 'bg-m3-primary/20 border-m3-primary/35 text-m3-primary'
                                : 'bg-m3-surfaceContainer border-white/[0.05] text-m3-muted'
                            }`}
                          >
                            <RenderVectorIcon name={badge.icon} className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-mono tabular-nums text-m3-primary font-bold">
                            +{badge.xpReward} XP
                          </span>
                        </div>
                        <h3 className="text-sm font-display font-bold text-m3-cream">
                          {badge.title}
                        </h3>
                        <p className="text-xs text-m3-sand mt-1 leading-relaxed">
                          {badge.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: SETTINGS (HOUSES SCIENTIFIC BODY MATH, ONBOARDING WIZARD, API & BACKUP) */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* Re-launch Onboarding Wizard Banner */}
              <div className="rounded-[32px] bg-m3-primaryContainer border border-m3-primary/35 p-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-display font-extrabold text-m3-cream">
                    Onboarding Setup Wizard
                  </h2>
                  <p className="text-xs text-m3-onPrimaryContainer/80 mt-0.5">
                    Re-run the step-by-step anthropometric & scientific target wizard.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setOnboardingStep(0);
                    setShowOnboarding(true);
                  }}
                  className="px-4 py-2.5 rounded-full bg-m3-primary text-m3-surface font-display font-extrabold text-xs shrink-0 active:scale-95 transition-transform"
                >
                  Run Wizard
                </button>
              </div>

              {/* SCIENTIFIC BODY MATH & BIOMETRICS ENGINE (INSIDE SETTINGS) */}
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                      Hall (Lancet 2011) + Forbes (1987)
                    </span>
                    <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                      Scientific Body Math
                    </h1>
                  </div>
                  <button
                    onClick={() => setShowFormulaSheet((v) => !v)}
                    className="px-3.5 py-2 rounded-full bg-m3-surfaceHigh text-m3-cream border border-white/[0.08] text-xs font-bold flex items-center gap-1.5"
                  >
                    <Info className="w-4 h-4 text-m3-primary" />
                    {showFormulaSheet ? 'Hide' : 'Equations'}
                  </button>
                </div>

                <MetabolicEquationVector className="w-full h-24" />

                {/* Big Texted Computed Intake Banner */}
                <div className="p-5 rounded-[28px] bg-m3-primaryContainer border border-m3-primary/35 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider text-m3-onPrimaryContainer/80 block">
                      Computed Daily Target
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-4xl font-mono tabular-nums font-extrabold text-m3-cream">
                        {metabolicResult.targetDailyCalories}
                      </span>
                      <span className="text-xs font-mono text-m3-onPrimaryContainer">kcal/d</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-m3-onPrimaryContainer/90 mt-1 block">
                      P {metabolicResult.recommendedMacros.proteinGrams}g • C{' '}
                      {metabolicResult.recommendedMacros.carbsGrams}g • F{' '}
                      {metabolicResult.recommendedMacros.fatGrams}g •{' '}
                      {metabolicResult.recommendedWaterMl}ml
                    </span>
                  </div>

                  <button
                    onClick={handleApplyScientificTargets}
                    className="px-5 py-3.5 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-xs shrink-0 active:scale-95 transition-all"
                  >
                    Apply Target
                  </button>
                </div>

                {mathAppliedToast && (
                  <div className="px-4 py-2.5 rounded-full bg-m3-primaryContainer border border-m3-primary/40 text-m3-onPrimaryContainer text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-m3-primary shrink-0" />
                    <span>Scientific calorie, macro & water targets applied.</span>
                  </div>
                )}

                {/* Divide-Y Scientific Parameters Ledger */}
                <div className="rounded-[24px] bg-m3-surfaceLow border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden text-xs">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-m3-sand">Resting Metabolic Rate (RMR)</span>
                    <span className="font-mono tabular-nums text-m3-cream font-bold">
                      {metabolicResult.activeRmr} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-m3-sand">
                      Maintenance TDEE (PAL ×{metabolicResult.pal.toFixed(2)})
                    </span>
                    <span className="font-mono tabular-nums text-m3-amber font-bold">
                      {metabolicResult.tdee} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-m3-sand">Forbes Lean Partitioning (p)</span>
                    <span className="font-mono tabular-nums text-m3-cream font-semibold">
                      {(metabolicResult.forbesPartitionP * 100).toFixed(1)}% LBM /{' '}
                      {((1 - metabolicResult.forbesPartitionP) * 100).toFixed(1)}% FM
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-m3-sand">Effective Energy Density (ρ_eff)</span>
                    <span className="font-mono tabular-nums text-m3-primarySoft font-bold">
                      {metabolicResult.effectiveEnergyDensityKcalPerKg} kcal/kg
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-m3-sand">Hydration Prescription (35ml/kg+)</span>
                    <span className="font-mono tabular-nums text-m3-sage font-bold">
                      {metabolicResult.recommendedWaterMl} ml/d
                    </span>
                  </div>
                </div>

                <AnimatePresence>
                  {showFormulaSheet && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 rounded-[22px] bg-m3-surfaceLow border border-white/[0.07] space-y-2 text-xs text-m3-sand leading-relaxed">
                        <p className="font-display font-bold text-m3-primary">
                          Peer-Reviewed Biomathematical Formulation
                        </p>
                        <p>
                          <strong className="text-m3-cream">1. Basal Expenditure:</strong>{' '}
                          Mifflin-St Jeor (1990) & Katch-McArdle (1973):
                          <span className="block font-mono text-m3-muted mt-0.5">
                            RMR = 10W + 6.25H - 5A + s | RMR_LBM = 370 + 21.6(LBM)
                          </span>
                        </p>
                        <p>
                          <strong className="text-m3-cream">2. Forbes Partitioning (1987):</strong>{' '}
                          Non-linear lean vs adipose tissue fraction:
                          <span className="block font-mono text-m3-muted mt-0.5">
                            p = C / (C + FM), rho_F = 7700 kcal/kg, rho_L = 1800 kcal/kg
                          </span>
                        </p>
                        <p>
                          <strong className="text-m3-cream">
                            3. Hall et al. (The Lancet, 2011):
                          </strong>{' '}
                          Dynamic adaptation (ε = 22 kcal/kg/d):
                          <span className="block font-mono text-m3-muted mt-0.5">
                            Delta_E = [rho_eff * (Delta_W / t)] + [0.25 * 22 * Delta_W]
                          </span>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Biometric Inputs inside Settings (Using NumericField for smooth typing) */}
                <div className="pt-2 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-m3-sand mb-1">Your Name</label>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-sm font-display font-bold text-m3-cream"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-1.5 rounded-full bg-m3-surfaceLow border border-white/[0.06] grid grid-cols-2">
                      {(['male', 'female'] as const).map((sex) => (
                        <button
                          key={sex}
                          onClick={() => setBiometricsDraft((b) => ({ ...b, sex }))}
                          className={`py-2 rounded-full text-xs font-display font-bold capitalize transition-colors ${
                            biometricsDraft.sex === sex
                              ? 'bg-m3-primary text-m3-surface'
                              : 'text-m3-sand'
                          }`}
                        >
                          {sex}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          resistanceTraining: !b.resistanceTraining,
                        }))
                      }
                      className={`px-3 py-2 rounded-full border text-xs font-display font-bold flex items-center justify-center gap-2 transition-colors ${
                        biometricsDraft.resistanceTraining
                          ? 'bg-m3-primaryContainer border-m3-primary/40 text-m3-onPrimaryContainer'
                          : 'bg-m3-surfaceLow border-white/[0.06] text-m3-sand'
                      }`}
                    >
                      <Dumbbell className="w-4 h-4" />
                      <span>Lifting: {biometricsDraft.resistanceTraining ? 'Yes' : 'No'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs text-m3-sand mb-1">Age (yr)</label>
                      <NumericField
                        value={biometricsDraft.age}
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, age: val }));
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-m3-sand mb-1">Height (cm)</label>
                      <NumericField
                        value={biometricsDraft.heightCm}
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, heightCm: val }));
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-m3-sand mb-1">Weight (kg)</label>
                      <NumericField
                        value={biometricsDraft.weightKg}
                        step="0.5"
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, weightKg: val }));
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream text-center"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-m3-sand mb-1">Target Weight (kg)</label>
                      <NumericField
                        value={biometricsDraft.targetWeightKg}
                        step="0.5"
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({ ...b, targetWeightKg: val }));
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-m3-primary/40 text-base font-mono tabular-nums font-bold text-m3-primary text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-m3-sand mb-1">Timeline (weeks)</label>
                      <NumericField
                        value={biometricsDraft.targetTimelineWeeks}
                        onChangeNumber={(val) => {
                          if (val !== undefined) {
                            setBiometricsDraft((b) => ({
                              ...b,
                              targetTimelineWeeks: val,
                            }));
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream text-center"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Activity Level</label>
                    <select
                      value={biometricsDraft.activityLevel}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          activityLevel: e.target.value as BiometricsProfile['activityLevel'],
                        }))
                      }
                      className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-xs font-display font-bold text-m3-cream"
                    >
                      {(
                        Object.keys(ACTIVITY_LABELS) as Array<BiometricsProfile['activityLevel']>
                      ).map((k) => (
                        <option key={k} value={k}>
                          {ACTIVITY_LABELS[k].label} (×{ACTIVITY_LABELS[k].pal})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* API Configuration Card */}
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-5 h-5 text-m3-primary" />
                  <h2 className="text-lg font-display font-extrabold text-m3-cream">
                    Vision API Connection
                  </h2>
                </div>

                <p className="text-xs text-m3-sand leading-relaxed">
                  Paste your personal Gemini API key from Google AI Studio. Includes automatic multi-model failover so 503 high-demand spikes never interrupt meal logging.
                </p>

                {hasBuiltInApiKey() && !localStorage.getItem('calquest_gemini_api_key') && (
                  <div className="p-3.5 rounded-2xl bg-m3-sage/15 border border-m3-sage/35 text-xs text-m3-cream flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-m3-sage shrink-0" />
                    <span>Built-in environment key detected and active.</span>
                  </div>
                )}

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full pl-4 pr-11 py-3.5 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-xs font-mono text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((s) => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-m3-sand hover:text-m3-cream"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestApiConnection}
                  disabled={testingApi}
                  className="w-full py-3 px-4 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest border border-white/[0.08] text-xs font-display font-bold text-m3-cream flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {testingApi ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-m3-primary" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4 text-m3-primary" />
                      Verify Connection
                    </>
                  )}
                </button>

                {apiTestResult && (
                  <div
                    className={`p-4 rounded-[22px] border text-xs flex items-start gap-2.5 ${
                      apiTestResult.ok
                        ? 'bg-m3-sage/15 border-m3-sage/35 text-m3-cream'
                        : 'bg-m3-rose/15 border-m3-rose/35 text-m3-cream'
                    }`}
                  >
                    {apiTestResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-m3-sage shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-m3-rose shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-display font-bold">
                        {apiTestResult.ok ? 'API Ready' : 'Connection Error'}
                      </p>
                      <p className="font-mono text-xs opacity-90 mt-0.5">
                        {apiTestResult.message} ({apiTestResult.latencyMs}ms)
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-m3-sand mb-1">
                    Personal Culinary Context (sent with every photo scan)
                  </label>
                  <textarea
                    rows={2}
                    value={customPromptDraft}
                    onChange={(e) => setCustomPromptDraft(e.target.value)}
                    placeholder="e.g. Indian home-cooked meals, 1 tsp oil/ghee default..."
                    className="w-full px-4 py-3 rounded-[22px] bg-m3-surfaceLow border border-white/[0.08] text-xs text-m3-cream focus:outline-none focus:border-m3-primary"
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Save All Settings
                </button>

                {settingsSavedToast && (
                  <p className="text-xs text-m3-primary text-center font-bold">
                    Settings saved.
                  </p>
                )}
              </div>

              {/* JOURNAL BACKUP & RESET CARD */}
              <div className="rounded-[32px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-display font-extrabold text-m3-cream">
                  Journal Backup & Reset
                </h3>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportBackupFile}
                  className="hidden"
                />
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleExportBackup}
                    className="py-3 px-3 rounded-full bg-m3-surfaceHigh text-m3-cream text-xs font-display font-bold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                  >
                    <Download className="w-3.5 h-3.5 text-m3-primary" />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={() => backupFileInputRef.current?.click()}
                    className="py-3 px-3 rounded-full bg-m3-surfaceHigh text-m3-cream text-xs font-display font-bold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                  >
                    <Upload className="w-3.5 h-3.5 text-m3-amber" />
                    <span>Restore</span>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Reset all logged meals, journal history, and XP?')) {
                        clearAllData();
                        setMeals(loadMeals());
                        setUserState(loadUserState());
                        setShowOnboarding(true);
                        setOnboardingStep(0);
                      }
                    }}
                    className="py-3 px-3 rounded-full bg-m3-rose/15 border border-m3-rose/35 text-m3-rose text-xs font-display font-bold flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>
                {backupToast && (
                  <p className="text-xs text-m3-primary font-bold text-center">{backupToast}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* WARM MATERIAL 3 EXPRESSIVE 5-TAB FLOATING PILL NAVIGATION BAR */}
      <nav className="fixed bottom-3 inset-x-4 max-w-[calc(28rem-2rem)] mx-auto z-40 rounded-full bg-m3-surfaceContainer/95 backdrop-blur-2xl border border-white/[0.1] px-2.5 py-2 shadow-[0_20px_40px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="grid grid-cols-5 items-center">
          {(
            [
              { id: 'dashboard', label: 'Today', Icon: Activity },
              { id: 'journal', label: 'Journal', Icon: BookOpen },
              { id: 'scan', label: 'Scan', Icon: Camera },
              { id: 'quests', label: 'Ranks', Icon: Trophy },
              { id: 'settings', label: 'Settings', Icon: Settings },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="relative flex flex-col items-center justify-center py-1 group"
              >
                <div className="relative px-4 py-1.5 rounded-full flex items-center justify-center">
                  {active && (
                    <motion.div
                      layoutId="m3-bottom-nav-pill"
                      transition={M3_SPRING}
                      className="absolute inset-0 rounded-full bg-m3-primary"
                    />
                  )}
                  <Icon
                    className={`w-4 h-4 relative z-10 transition-colors ${
                      active
                        ? 'text-m3-surface stroke-[2.5]'
                        : 'text-m3-sand group-hover:text-m3-cream'
                    }`}
                  />
                </div>
                <span
                  className={`text-xs font-display mt-0.5 transition-colors ${
                    active ? 'text-m3-primary font-extrabold' : 'text-m3-muted font-medium'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* EDIT MEAL MODAL */}
      <AnimatePresence>
        {editingMeal && (
          <EditMealModal
            meal={editingMeal}
            onClose={() => setEditingMeal(null)}
            onSave={handleSaveMealEdit}
            onDelete={handleDeleteMeal}
            onSaveAsTemplate={handleSaveMealAsTemplate}
          />
        )}
      </AnimatePresence>

      {/* FREQUENT & QUICK ADD MODAL */}
      <AnimatePresence>
        {quickAddModalDate && (
          <FrequentMealsModal
            targetDateKey={quickAddModalDate}
            frequentMeals={frequentMealsList}
            onClose={() => setQuickAddModalDate(null)}
            onQuickLogTemplate={(tpl, saveToStaples) =>
              handleQuickLogTemplate(tpl, saveToStaples, quickAddModalDate)
            }
            onDeleteTemplate={handleDeleteTemplate}
          />
        )}
      </AnimatePresence>

      {/* XP & LEVEL-UP MODAL OVERLAY */}
      <AnimatePresence>
        {celebrationData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={M3_SPRING}
              className="w-full max-w-xs rounded-[36px] bg-m3-surfaceContainer border border-m3-primary/40 p-6 text-center space-y-4 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-m3-primaryContainer border border-m3-primary/35 flex items-center justify-center mx-auto text-m3-primary">
                <Zap className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-bold">
                  Journal Updated
                </span>
                <h3 className="text-3xl font-mono tabular-nums font-extrabold text-m3-cream mt-1">
                  +{celebrationData.xpGained} XP
                </h3>
                {celebrationData.leveledUp && (
                  <p className="text-sm font-display font-bold text-m3-amber mt-1">
                    Level {celebrationData.newLevel} Reached
                  </p>
                )}
              </div>

              {celebrationData.newBadges.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                  <p className="text-xs font-mono uppercase tracking-wider text-m3-sand">
                    New Milestone Unlocked
                  </p>
                  {celebrationData.newBadges.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-[22px] bg-m3-surfaceLow border border-m3-primary/25 flex items-center gap-3 text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-m3-primaryContainer flex items-center justify-center text-m3-primary shrink-0">
                        <RenderVectorIcon name={b.icon} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-display font-bold text-m3-cream">{b.title}</p>
                        <p className="text-xs text-m3-sand">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setCelebrationData(null)}
                className="w-full py-3.5 rounded-full bg-m3-primary text-m3-surface font-display font-extrabold text-sm active:scale-95 transition-transform"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export { App };
