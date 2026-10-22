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
  Plus,
  RefreshCw,
  Scale,
  Settings,
  Shield,
  Sliders,
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
  UserGoals,
  UserState,
} from './types';
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

type NavTab = 'dashboard' | 'journal' | 'scan' | 'math' | 'quests' | 'settings';

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

async function compressImageDataUrl(dataUrl: string, maxWidth = 1024): Promise<string> {
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
      resolve(canvas.toDataURL('image/jpeg', 0.82));
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
    const initialMeals = loadMeals();
    return !initial.onboardingCompleted && initialMeals.length === 0;
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  // Hydrate from IndexedDB on initial mount so large multi-day histories stay intact
  useEffect(() => {
    let mounted = true;
    hydrateFromIndexedDb().then(({ state, meals: idbMeals }) => {
      if (!mounted) return;
      if (idbMeals && idbMeals.length > meals.length) {
        setMeals(idbMeals);
      }
      if (state && (state.xp > userState.xp || state.onboardingCompleted)) {
        setUserState(state);
        setGoalsDraft(state.goals);
        setBiometricsDraft(state.biometrics);
        if (state.userName) setNameDraft(state.userName);
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

  const past14Days = useMemo(() => getPastDateKeys(14), [todayKey]);
  const past7Days = useMemo(() => past14Days.slice(-7), [past14Days]);

  const journal7DayStats = useMemo(() => {
    const daySummaries = past7Days.map((d) => {
      const dayMeals = meals.filter((m) => m.dateKey === d.dateKey);
      const calories = dayMeals.reduce((s, m) => s + m.totalCalories, 0);
      const protein = dayMeals.reduce((s, m) => s + m.macros.proteinGrams, 0);
      const weight = userState.dailyJournal?.[d.dateKey]?.weightKg;
      return {
        ...d,
        calories,
        protein,
        mealCount: dayMeals.length,
        weight,
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
    };
    setGoalsDraft(newGoals);
    const todayEntry: DailyJournalEntry = {
      dateKey: todayKey,
      weightKg: biometricsDraft.weightKg,
      energyLevel: 'steady',
      note: 'Started personal metabolic & nutrition journal.',
      updatedAt: new Date().toISOString(),
    };
    setUserState((prev) => ({
      ...prev,
      userName: nameDraft.trim() || 'Explorer',
      onboardingCompleted: true,
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
    const entry: DailyJournalEntry = {
      dateKey: selectedJournalDate,
      weightKg: parsedWeight && !Number.isNaN(parsedWeight) ? parsedWeight : undefined,
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

  async function handleTakePhoto(source: 'camera' | 'gallery') {
    setScanError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await CapCamera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        });
        if (photo.dataUrl) {
          const compressed = await compressImageDataUrl(photo.dataUrl);
          setCapturedPhotoUrl(compressed);
          setAnalysisResult(null);
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
        const compressed = await compressImageDataUrl(reader.result);
        setCapturedPhotoUrl(compressed);
        setAnalysisResult(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRunGeminiAnalysis() {
    if (!capturedPhotoUrl) return;
    setScanError(null);
    setIsAnalyzing(true);
    try {
      const mimeMatch = capturedPhotoUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const result = await analyzeFoodPhotoWithGemini({
        base64Data: capturedPhotoUrl,
        mimeType,
        userNote,
        customInstruction: userState.customPromptInstruction,
      });

      setAnalysisResult(result);
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
    };
    setGoalsDraft(newGoals);
    setUserState((prev) => ({
      ...prev,
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
      goals: {
        dailyCalories: Math.max(800, Number(goalsDraft.dailyCalories) || 2100),
        proteinGrams: Math.max(20, Number(goalsDraft.proteinGrams) || 140),
        carbsGrams: Math.max(20, Number(goalsDraft.carbsGrams) || 220),
        fatGrams: Math.max(15, Number(goalsDraft.fatGrams) || 70),
        fiberGrams: Math.max(10, Number(goalsDraft.fiberGrams) || 30),
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

  // FULL-SCREEN EDITORIAL ONBOARDING EXPERIENCE
  if (showOnboarding) {
    return (
      <div className="min-h-[100dvh] bg-m3-surface text-m3-cream flex flex-col justify-between max-w-md mx-auto px-5 py-7 relative overflow-hidden">
        {/* Warm Terracotta & Sunlit Peach Radial Glow */}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-96 max-w-md mx-auto z-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 60% at 50% -10%, rgba(244, 132, 95, 0.24), transparent 70%)',
          }}
        />

        {/* Top Step Progress Pills */}
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            {[0, 1, 2, 3].map((stepIdx) => (
              <div
                key={stepIdx}
                className={`h-2 rounded-full transition-all duration-500 flex-1 ${
                  stepIdx <= onboardingStep ? 'bg-m3-primary' : 'bg-m3-surfaceHighest'
                }`}
              />
            ))}
          </div>
          {userState.onboardingCompleted && (
            <button
              onClick={() => setShowOnboarding(false)}
              className="ml-3 px-3.5 py-1.5 rounded-full bg-m3-surfaceContainer text-m3-sand text-xs font-bold"
            >
              Close
            </button>
          )}
        </div>

        {/* Step Content Area */}
        <div className="relative z-10 my-auto py-6">
          <AnimatePresence mode="wait">
            {onboardingStep === 0 && (
              <motion.div
                key="onboard-0"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-6"
              >
                <div className="w-16 h-16 rounded-[24px] bg-m3-primaryContainer border border-m3-primary/30 flex items-center justify-center text-m3-primary">
                  <BookOpen className="w-8 h-8" />
                </div>

                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold">
                    Personal Metabolic Journal
                  </span>
                  <h1 className="text-4xl font-display font-extrabold text-m3-cream tracking-tight mt-2 leading-[1.1]">
                    Effortless food vision & body math.
                  </h1>
                  <p className="text-base text-m3-sand mt-3 leading-relaxed">
                    Snap a photo of your meal, track your multi-day nutrition journal, and let peer-reviewed metabolic equations guide your daily intake.
                  </p>
                </div>

                <div className="rounded-[32px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand mb-2">
                      What should we call you?
                    </label>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Your name (e.g. Akhand)"
                      className="w-full px-5 py-4 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-lg font-display font-bold text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand mb-2">
                      Primary Direction
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        {
                          label: 'Lean Cut',
                          sub: 'Lose fat',
                          apply: () =>
                            setBiometricsDraft((b) => ({
                              ...b,
                              targetWeightKg: Math.max(45, b.weightKg - 6),
                            })),
                          active: biometricsDraft.targetWeightKg < biometricsDraft.weightKg,
                        },
                        {
                          label: 'Recomp',
                          sub: 'Maintain',
                          apply: () =>
                            setBiometricsDraft((b) => ({
                              ...b,
                              targetWeightKg: b.weightKg,
                            })),
                          active: biometricsDraft.targetWeightKg === biometricsDraft.weightKg,
                        },
                        {
                          label: 'Build',
                          sub: 'Gain mass',
                          apply: () =>
                            setBiometricsDraft((b) => ({
                              ...b,
                              targetWeightKg: b.weightKg + 5,
                            })),
                          active: biometricsDraft.targetWeightKg > biometricsDraft.weightKg,
                        },
                      ].map((goal) => (
                        <button
                          key={goal.label}
                          onClick={goal.apply}
                          className={`p-3.5 rounded-[24px] border text-left transition-all ${
                            goal.active
                              ? 'bg-m3-primaryContainer border-m3-primary text-m3-cream'
                              : 'bg-m3-surfaceLow border-white/[0.06] text-m3-sand'
                          }`}
                        >
                          <p className="text-sm font-display font-bold">{goal.label}</p>
                          <p className="text-xs text-m3-muted mt-0.5">{goal.sub}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {onboardingStep === 1 && (
              <motion.div
                key="onboard-1"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-5"
              >
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold">
                    Step 2 of 4 • Biometrics
                  </span>
                  <h1 className="text-3xl font-display font-extrabold text-m3-cream tracking-tight mt-1">
                    Calibrate your body metrics.
                  </h1>
                  <p className="text-sm text-m3-sand mt-1">
                    Used by the Mifflin-St Jeor, Forbes, and Hall equations to compute your exact energy expenditure.
                  </p>
                </div>

                {/* Sex & Lifting Pills */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-1.5 rounded-full bg-m3-surfaceContainer border border-white/[0.08] grid grid-cols-2">
                    {(['male', 'female'] as const).map((sex) => (
                      <button
                        key={sex}
                        onClick={() => setBiometricsDraft((b) => ({ ...b, sex }))}
                        className={`py-2.5 rounded-full text-sm font-display font-bold capitalize transition-all ${
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
                    className={`px-4 py-2.5 rounded-full border text-sm font-display font-bold flex items-center justify-center gap-2 transition-all ${
                      biometricsDraft.resistanceTraining
                        ? 'bg-m3-primaryContainer border-m3-primary text-m3-onPrimaryContainer'
                        : 'bg-m3-surfaceContainer border-white/[0.08] text-m3-sand'
                    }`}
                  >
                    <Dumbbell className="w-4 h-4" />
                    <span>Lifting: {biometricsDraft.resistanceTraining ? 'Yes' : 'No'}</span>
                  </button>
                </div>

                <div className="rounded-[34px] bg-m3-surfaceContainer border border-white/[0.08] p-5 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-m3-sand mb-1.5">
                      Age (years)
                    </label>
                    <input
                      type="number"
                      value={biometricsDraft.age}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          age: Number(e.target.value) || 24,
                        }))
                      }
                      className="w-full px-4 py-3.5 rounded-[22px] bg-m3-surfaceLow border border-white/[0.08] text-2xl font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-m3-sand mb-1.5">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={biometricsDraft.heightCm}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          heightCm: Number(e.target.value) || 175,
                        }))
                      }
                      className="w-full px-4 py-3.5 rounded-[22px] bg-m3-surfaceLow border border-white/[0.08] text-2xl font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-m3-sand mb-1.5">
                      Current Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={biometricsDraft.weightKg}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          weightKg: Number(e.target.value) || 75,
                        }))
                      }
                      className="w-full px-4 py-3.5 rounded-[22px] bg-m3-surfaceLow border border-white/[0.08] text-2xl font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-m3-sand mb-1.5">
                      Target Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={biometricsDraft.targetWeightKg}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          targetWeightKg: Number(e.target.value) || 70,
                        }))
                      }
                      className="w-full px-4 py-3.5 rounded-[22px] bg-m3-surfaceLow border border-m3-primary/40 text-2xl font-mono tabular-nums font-bold text-m3-primary"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="flex justify-between text-xs font-semibold text-m3-sand mb-1.5">
                      <span>Target Timeline</span>
                      <span className="font-mono tabular-nums text-m3-primary font-bold">
                        {biometricsDraft.targetTimelineWeeks} weeks
                      </span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="52"
                      value={biometricsDraft.targetTimelineWeeks}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          targetTimelineWeeks: Number(e.target.value) || 12,
                        }))
                      }
                      className="w-full accent-[#F4845F]"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {onboardingStep === 2 && (
              <motion.div
                key="onboard-2"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-5"
              >
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold">
                    Step 3 of 4 • Scientific Prescription
                  </span>
                  <h1 className="text-3xl font-display font-extrabold text-m3-cream tracking-tight mt-1">
                    Your daily energy target.
                  </h1>
                </div>

                {/* Big Texted Scientific Prescription Hero Card */}
                <div className="rounded-[36px] bg-m3-primaryContainer border border-m3-primary/35 p-6 text-center space-y-3">
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-onPrimaryContainer/80 block">
                    Hall (Lancet 2011) Optimal Intake
                  </span>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-5xl font-mono tabular-nums font-extrabold text-m3-cream">
                      {metabolicResult.targetDailyCalories}
                    </span>
                    <span className="text-base font-mono text-m3-onPrimaryContainer">kcal/day</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {[
                      { label: 'Protein', val: `${metabolicResult.recommendedMacros.proteinGrams}g` },
                      { label: 'Carbs', val: `${metabolicResult.recommendedMacros.carbsGrams}g` },
                      { label: 'Fat', val: `${metabolicResult.recommendedMacros.fatGrams}g` },
                      { label: 'Fiber', val: `${metabolicResult.recommendedMacros.fiberGrams}g` },
                    ].map((m) => (
                      <div key={m.label} className="p-2.5 rounded-2xl bg-black/25">
                        <span className="text-xs text-m3-onPrimaryContainer/70 block">{m.label}</span>
                        <span className="text-base font-mono tabular-nums font-bold text-m3-cream">
                          {m.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activity Level Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-m3-sand">
                    Select Daily Activity Level
                  </label>
                  {(
                    Object.keys(ACTIVITY_LABELS) as Array<BiometricsProfile['activityLevel']>
                  ).map((levelKey) => {
                    const item = ACTIVITY_LABELS[levelKey];
                    const active = biometricsDraft.activityLevel === levelKey;
                    return (
                      <button
                        key={levelKey}
                        onClick={() =>
                          setBiometricsDraft((b) => ({ ...b, activityLevel: levelKey }))
                        }
                        className={`w-full px-4 py-3 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                          active
                            ? 'bg-m3-surfaceHigh border-m3-primary text-m3-cream'
                            : 'bg-m3-surfaceContainer border-white/[0.06] text-m3-sand'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-display font-bold">{item.label}</p>
                          <p className="text-xs text-m3-muted">{item.desc}</p>
                        </div>
                        <span className="text-sm font-mono tabular-nums text-m3-primary font-bold">
                          ×{item.pal.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {onboardingStep === 3 && (
              <motion.div
                key="onboard-3"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={M3_SPRING}
                className="space-y-5"
              >
                <div className="w-16 h-16 rounded-[24px] bg-m3-primaryContainer border border-m3-primary/30 flex items-center justify-center text-m3-primary">
                  <KeyRound className="w-8 h-8" />
                </div>

                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold">
                    Step 4 of 4 • Multimodal Vision
                  </span>
                  <h1 className="text-3xl font-display font-extrabold text-m3-cream tracking-tight mt-1">
                    Connect your Gemini API Key.
                  </h1>
                  <p className="text-sm text-m3-sand mt-2 leading-relaxed">
                    Paste your Google AI Studio key so meal photos are analyzed with automatic multi-model 503 failover. Your journal is saved locally in IndexedDB + LocalStorage.
                  </p>
                </div>

                <div className="rounded-[34px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-4">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste AIzaSy... key (or skip for now)"
                    className="w-full px-5 py-4 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-sm font-mono text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                  />

                  <button
                    type="button"
                    onClick={handleTestApiConnection}
                    disabled={testingApi || !apiKeyInput.trim()}
                    className="w-full py-3.5 px-5 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest disabled:opacity-50 border border-white/[0.08] text-sm font-display font-bold text-m3-cream flex items-center justify-center gap-2"
                  >
                    {testingApi ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-m3-primary" />
                        Verifying Key...
                      </>
                    ) : (
                      <>
                        <Wifi className="w-4 h-4 text-m3-primary" />
                        Test API Connection
                      </>
                    )}
                  </button>

                  {apiTestResult && (
                    <div
                      className={`p-3.5 rounded-[22px] border text-xs flex items-start gap-2.5 ${
                        apiTestResult.ok
                          ? 'bg-m3-sage/15 border-m3-sage/40 text-m3-cream'
                          : 'bg-m3-rose/15 border-m3-rose/40 text-m3-cream'
                      }`}
                    >
                      {apiTestResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-m3-sage shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-m3-rose shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-display font-bold">
                          {apiTestResult.ok ? 'Connected' : 'Connection Issue'}
                        </p>
                        <p className="font-mono mt-0.5 opacity-90">{apiTestResult.message}</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation Buttons for Onboarding */}
        <div className="relative z-10 flex items-center gap-3 pt-2">
          {onboardingStep > 0 && (
            <button
              onClick={() => setOnboardingStep((s) => s - 1)}
              className="p-4 rounded-full bg-m3-surfaceContainer border border-white/[0.08] text-m3-cream active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {onboardingStep < 3 ? (
            <button
              onClick={() => setOnboardingStep((s) => s + 1)}
              className="flex-1 py-4 px-6 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleFinishOnboarding}
              className="flex-1 py-4 px-6 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Start My Journal</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-m3-surface text-m3-cream flex flex-col max-w-md mx-auto relative overflow-x-hidden selection:bg-m3-primary/30 border-x border-white/[0.04]">
      {/* Warm Terracotta Atmospheric Top Glow */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-80 max-w-md mx-auto z-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 55% at 50% -15%, rgba(244, 132, 95, 0.18), transparent 70%)',
        }}
      />

      {/* TOP WARM MATERIAL 3 EXPRESSIVE APP BAR */}
      <header className="sticky top-0 z-30 backdrop-blur-2xl bg-m3-surface/85 border-b border-white/[0.06] px-4 pt-3.5 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[22px] bg-m3-primaryContainer border border-m3-primary/30 flex items-center justify-center text-m3-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <RenderVectorIcon name={levelInfo.rankIcon} className="w-6 h-6" />
            </div>
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

          {/* Warm Streak Pill */}
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
                  Connect your key in Config for instant photo calorie scans.
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
          {/* TAB 1: TODAY DASHBOARD (BIG TEXTED, SMOOTH ROUND TERRACOTTA SUITE) */}
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
                    onClick={() => setActiveTab('journal')}
                    className="inline-flex items-center gap-1.5 text-xs font-display font-bold px-4 py-2 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-m3-cream border border-white/[0.08] active:scale-95 transition-all"
                  >
                    <BookOpen className="w-4 h-4 text-m3-primary" />
                    <span>Journal</span>
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
                    <span className="text-xs text-m3-muted block">Meals</span>
                    <span className="text-lg font-mono tabular-nums font-extrabold text-m3-cream">
                      {todayMeals.length} logged
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

              {/* BIG ROUNDED CAMERA SCAN CTA */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab('scan')}
                className="w-full p-5 rounded-[34px] bg-m3-primary hover:bg-m3-primarySoft text-m3-surface flex items-center justify-between shadow-lg transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-m3-surface text-m3-primary flex items-center justify-center shrink-0">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-lg font-display font-extrabold tracking-tight">
                      Snap & Analyze Meal
                    </h2>
                    <p className="text-xs font-medium text-m3-surface/80">
                      Instant visual portion & macro breakdown (+50-100 XP)
                    </p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-m3-surface/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </motion.button>

              {/* TODAY'S MEAL TIMELINE */}
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-lg font-display font-extrabold text-m3-cream">
                    Today's Plate Log ({todayMeals.length})
                  </h2>
                  <button
                    onClick={() => setActiveTab('journal')}
                    className="text-xs font-display font-bold text-m3-primary hover:underline"
                  >
                    Past Days History
                  </button>
                </div>

                {todayMeals.length === 0 ? (
                  <div className="rounded-[34px] bg-m3-surfaceContainer border border-white/[0.07] p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-m3-surfaceHigh border border-white/[0.08] flex items-center justify-center mx-auto mb-3 text-m3-primary">
                      <Utensils className="w-6 h-6" />
                    </div>
                    <p className="text-base font-display font-bold text-m3-cream">
                      Your plate journal is empty today
                    </p>
                    <p className="text-xs text-m3-sand mt-1 max-w-xs mx-auto leading-relaxed">
                      Tap "Snap & Analyze Meal" above to take a photo of your food and compute its calories and macros.
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
                        className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.08] p-4 flex gap-4 items-center"
                      >
                        {meal.photoDataUrl ? (
                          <img
                            src={meal.photoDataUrl}
                            alt={meal.mealName}
                            className="w-20 h-20 rounded-[22px] object-cover shrink-0 border border-white/[0.1]"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-[22px] bg-m3-surfaceHigh flex items-center justify-center text-m3-primary shrink-0 border border-white/[0.08]">
                            <RenderVectorIcon name={meal.mealType} className="w-7 h-7" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-m3-surfaceHigh text-m3-sand font-bold">
                              {meal.mealType}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-m3-primary font-bold">
                              Score {meal.healthScore}
                            </span>
                          </div>
                          <h3 className="text-base font-display font-extrabold text-m3-cream truncate mt-1">
                            {meal.mealName}
                          </h3>
                          <div className="flex items-center gap-3 mt-1.5 text-xs font-mono tabular-nums">
                            <span className="text-m3-cream font-extrabold text-sm">
                              {meal.totalCalories} kcal
                            </span>
                            <span className="text-m3-primarySoft">P {meal.macros.proteinGrams}g</span>
                            <span className="text-m3-amber">C {meal.macros.carbsGrams}g</span>
                            <span className="text-m3-rose">F {meal.macros.fatGrams}g</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteMeal(meal.id)}
                          className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-muted hover:text-m3-rose transition-colors"
                          title="Delete meal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* TAB 2: MULTI-DAY JOURNAL & HISTORY */}
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
                        {selectedDateMeals.length} meals • {selectedDateTotals.calories} kcal • P{' '}
                        {selectedDateTotals.protein}g
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

              {/* MEALS LOGGED ON SELECTED DATE */}
              <section className="space-y-3">
                <h3 className="text-base font-display font-extrabold text-m3-cream px-1">
                  Meals on {selectedJournalDate} ({selectedDateMeals.length})
                </h3>
                {selectedDateMeals.length === 0 ? (
                  <div className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.07] p-6 text-center text-xs text-m3-sand">
                    No meals recorded on {selectedJournalDate}.
                  </div>
                ) : (
                  selectedDateMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.08] p-4 flex gap-4 items-center"
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
                    </div>
                  ))
                )}
              </section>

              {/* JOURNAL BACKUP & RESTORE CARD */}
              <section className="rounded-[32px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-display font-extrabold text-m3-cream">
                      Journal Backup & Restore
                    </h3>
                    <p className="text-xs text-m3-sand">
                      Auto-saved to IndexedDB. Export a portable `.json` copy anytime.
                    </p>
                  </div>
                </div>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportBackupFile}
                  className="hidden"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleExportBackup}
                    className="py-3 px-4 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-m3-cream text-xs font-display font-bold flex items-center justify-center gap-2 border border-white/[0.08]"
                  >
                    <Download className="w-4 h-4 text-m3-primary" />
                    <span>Export Backup</span>
                  </button>
                  <button
                    onClick={() => backupFileInputRef.current?.click()}
                    className="py-3 px-4 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-m3-cream text-xs font-display font-bold flex items-center justify-center gap-2 border border-white/[0.08]"
                  >
                    <Upload className="w-4 h-4 text-m3-amber" />
                    <span>Restore File</span>
                  </button>
                </div>
                {backupToast && (
                  <p className="text-xs text-m3-primary font-bold text-center">{backupToast}</p>
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
                <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                  Multimodal Food Vision
                </span>
                <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                  Visual Plate Scanner
                </h1>
                <p className="text-sm text-m3-sand mt-1">
                  Snap a photo or pick from your gallery for itemized portion and nutrition analysis.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {/* Segmented Meal Type Bar with Shared Spring Pill */}
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

                {/* Camera / Image Preview Frame */}
                {!capturedPhotoUrl ? (
                  <div className="mt-5 border border-dashed border-white/[0.15] rounded-[32px] p-8 text-center bg-m3-surfaceLow">
                    <div className="w-16 h-16 rounded-full bg-m3-primaryContainer border border-m3-primary/30 flex items-center justify-center mx-auto mb-3 text-m3-primary">
                      <Camera className="w-7 h-7" />
                    </div>
                    <p className="text-lg font-display font-extrabold text-m3-cream mb-1">
                      Capture Your Meal
                    </p>
                    <p className="text-xs text-m3-sand mb-6 max-w-xs mx-auto leading-relaxed">
                      Keep the full plate or bowl in frame for accurate portion depth and calorie estimation.
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
                      <input
                        type="text"
                        value={userNote}
                        onChange={(e) => setUserNote(e.target.value)}
                        placeholder="Add preparation details or hidden ingredients..."
                        className="w-full px-4 py-3.5 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-sm text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
                      />
                    </div>

                    {!analysisResult && (
                      <button
                        onClick={handleRunGeminiAnalysis}
                        disabled={isAnalyzing}
                        className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primarySoft disabled:opacity-60 text-m3-surface font-display font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analyzing Portions & Macros...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Calculate Calories & Macros
                          </>
                        )}
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
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase tracking-wider px-3 py-0.5 rounded-full bg-m3-primaryContainer text-m3-onPrimaryContainer border border-m3-primary/25 font-bold">
                          Score {analysisResult.healthScore}/100
                        </span>
                        <span className="text-xs font-mono uppercase tracking-wider px-3 py-0.5 rounded-full bg-m3-surfaceHigh text-m3-sand">
                          {analysisResult.confidence}
                        </span>
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

                  {/* Nutritionist Feedback */}
                  <div className="p-4 rounded-[24px] bg-m3-surfaceLow border border-white/[0.06] text-xs text-m3-sand leading-relaxed">
                    {analysisResult.wittyFeedback}
                  </div>

                  {/* Macro Summary Strip */}
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

                  {/* Portion Multiplier Control */}
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

                  {/* Itemized Food Components Ledger */}
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

          {/* TAB 4: SCIENTIFIC BODY MATH CALCULATOR */}
          {activeTab === 'math' && (
            <motion.div
              key="math"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-m3-primary font-semibold block">
                      Hall (Lancet 2011) + Forbes (1987)
                    </span>
                    <h1 className="text-2xl font-display font-extrabold text-m3-cream tracking-tight mt-0.5">
                      Body Math Engine
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

                {/* Big Texted Computed Intake Banner */}
                <div className="mt-5 p-5 rounded-[30px] bg-m3-primaryContainer border border-m3-primary/35 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider text-m3-onPrimaryContainer/80 block">
                      Scientific Daily Target
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-4xl font-mono tabular-nums font-extrabold text-m3-cream">
                        {metabolicResult.targetDailyCalories}
                      </span>
                      <span className="text-xs font-mono text-m3-onPrimaryContainer">kcal/d</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-m3-onPrimaryContainer/90 mt-1 block">
                      {metabolicResult.dailyCalorieDelta === 0
                        ? 'Maintenance'
                        : `${metabolicResult.dailyCalorieDelta > 0 ? '+' : ''}${
                            metabolicResult.dailyCalorieDelta
                          } kcal/d (${metabolicResult.weeklyRateKg} kg/wk)`}
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
                  <div className="mt-3 px-4 py-2.5 rounded-full bg-m3-primaryContainer border border-m3-primary/40 text-m3-onPrimaryContainer text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-m3-primary shrink-0" />
                    <span>Daily calorie & macro targets applied to your journal.</span>
                  </div>
                )}

                {/* Divide-Y Scientific Parameters Ledger */}
                <div className="mt-4 rounded-[26px] bg-m3-surfaceLow border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden text-xs">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-m3-sand">Resting Metabolic Rate (RMR)</span>
                    <span className="font-mono tabular-nums text-m3-cream font-bold text-sm">
                      {metabolicResult.activeRmr} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-m3-sand">
                      Maintenance TDEE (PAL ×{metabolicResult.pal.toFixed(2)})
                    </span>
                    <span className="font-mono tabular-nums text-m3-amber font-bold text-sm">
                      {metabolicResult.tdee} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-m3-sand">Forbes Lean Partitioning (p)</span>
                    <span className="font-mono tabular-nums text-m3-cream font-semibold">
                      {(metabolicResult.forbesPartitionP * 100).toFixed(1)}% LBM /{' '}
                      {((1 - metabolicResult.forbesPartitionP) * 100).toFixed(1)}% FM
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-m3-sand">Effective Energy Density (ρ_eff)</span>
                    <span className="font-mono tabular-nums text-m3-primarySoft font-bold">
                      {metabolicResult.effectiveEnergyDensityKcalPerKg} kcal/kg
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-m3-sand">Hall Adaptation (ε = 22)</span>
                    <span className="font-mono tabular-nums text-m3-cream font-semibold">
                      {metabolicResult.metabolicAdaptationKcal >= 0 ? '+' : ''}
                      {metabolicResult.metabolicAdaptationKcal} kcal/d
                    </span>
                  </div>
                </div>

                {/* Collapsible Research Paper Reference Sheet */}
                <AnimatePresence>
                  {showFormulaSheet && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 p-4 rounded-[24px] bg-m3-surfaceLow border border-white/[0.07] space-y-2.5 text-xs text-m3-sand leading-relaxed">
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
                          Fraction of weight change from lean vs adipose tissue:
                          <span className="block font-mono text-m3-muted mt-0.5">
                            p = C / (C + FM), C = 10.4 * (rho_L / rho_F) = 1.996 kg
                          </span>
                        </p>
                        <p>
                          <strong className="text-m3-cream">
                            3. Hall et al. (The Lancet, 2011):
                          </strong>{' '}
                          Dynamic adaptation (ε = 22 kcal/kg/d):
                          <span className="block font-mono text-m3-muted mt-0.5">
                            Delta_E = [rho_eff * (Delta_W / t)] + [0.5 * 22 * Delta_W]
                          </span>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Biometric Input Controls */}
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-m3-primary" />
                  <h2 className="text-lg font-display font-extrabold text-m3-cream">
                    Biometric Parameters
                  </h2>
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Age (years)</label>
                    <input
                      type="number"
                      value={biometricsDraft.age}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          age: Number(e.target.value) || 24,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-lg font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Height (cm)</label>
                    <input
                      type="number"
                      value={biometricsDraft.heightCm}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          heightCm: Number(e.target.value) || 175,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-lg font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Current Weight (kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={biometricsDraft.weightKg}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          weightKg: Number(e.target.value) || 70,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-lg font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Target Weight (kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={biometricsDraft.targetWeightKg}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          targetWeightKg: Number(e.target.value) || 70,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-m3-primary/40 text-lg font-mono tabular-nums font-bold text-m3-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Timeline (weeks)</label>
                    <input
                      type="number"
                      min="1"
                      max="104"
                      value={biometricsDraft.targetTimelineWeeks}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          targetTimelineWeeks: Math.max(1, Number(e.target.value) || 12),
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-lg font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Body Fat % (Optional)</label>
                    <input
                      type="number"
                      placeholder={`Auto (~${metabolicResult.estimatedBodyFatPct}%)`}
                      value={biometricsDraft.bodyFatPct ?? ''}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          bodyFatPct: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-lg font-mono tabular-nums font-bold text-m3-cream placeholder-m3-muted"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: QUESTS, RANKS & ACHIEVEMENT BADGES */}
          {activeTab === 'quests' && (
            <motion.div
              key="quests"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* Daily Quests Card */}
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

              {/* Badges Grid */}
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

          {/* TAB 6: SETTINGS, ONBOARDING WIZARD & API DIAGNOSTICS */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* Re-launch Onboarding Banner */}
              <div className="rounded-[32px] bg-m3-primaryContainer border border-m3-primary/30 p-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-display font-extrabold text-m3-cream">
                    Guided Onboarding Setup
                  </h2>
                  <p className="text-xs text-m3-onPrimaryContainer/80 mt-0.5">
                    Re-run the 4-step body metric & journal calibration wizard anytime.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setOnboardingStep(0);
                    setShowOnboarding(true);
                  }}
                  className="px-4 py-2.5 rounded-full bg-m3-primary text-m3-surface font-display font-extrabold text-xs shrink-0 active:scale-95 transition-transform"
                >
                  Open Wizard
                </button>
              </div>

              {/* API Configuration Card */}
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-5 h-5 text-m3-primary" />
                  <h1 className="text-lg font-display font-extrabold text-m3-cream">
                    Vision API Connection
                  </h1>
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
              </div>

              {/* Manual Profile & Goals Override */}
              <div className="rounded-[36px] bg-m3-surfaceContainer border border-white/[0.08] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-m3-primary" />
                    <h2 className="text-base font-display font-extrabold text-m3-cream">
                      Profile & Targets
                    </h2>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-m3-sand mb-1">Your Name</label>
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-sm font-display font-bold text-m3-cream"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">
                      Daily Calories (kcal)
                    </label>
                    <input
                      type="number"
                      value={goalsDraft.dailyCalories}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          dailyCalories: Number(e.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Protein (g)</label>
                    <input
                      type="number"
                      value={goalsDraft.proteinGrams}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          proteinGrams: Number(e.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Carbs (g)</label>
                    <input
                      type="number"
                      value={goalsDraft.carbsGrams}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          carbsGrams: Number(e.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-m3-sand mb-1">Dietary Fat (g)</label>
                    <input
                      type="number"
                      value={goalsDraft.fatGrams}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          fatGrams: Number(e.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.08] text-base font-mono tabular-nums font-bold text-m3-cream"
                    />
                  </div>
                </div>

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
                  Save Configuration
                </button>

                {settingsSavedToast && (
                  <p className="text-xs text-m3-primary text-center font-bold">
                    Configuration saved.
                  </p>
                )}
              </div>

              {/* Reset Data */}
              <div className="rounded-[30px] bg-m3-surfaceContainer border border-white/[0.06] p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-display font-bold text-m3-cream">
                    Reset Device Journal
                  </p>
                  <p className="text-xs text-m3-sand">
                    Clear all meals, journal entries, and XP on this phone.
                  </p>
                </div>
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
                  className="px-4 py-2.5 rounded-full bg-m3-rose/15 border border-m3-rose/35 text-m3-rose text-xs font-display font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* WARM MATERIAL 3 EXPRESSIVE FLOATING PILL NAVIGATION BAR */}
      <nav className="fixed bottom-3 inset-x-3 max-w-[calc(28rem-1.5rem)] mx-auto z-40 rounded-full bg-m3-surfaceContainer/95 backdrop-blur-2xl border border-white/[0.1] px-2 py-2 shadow-[0_20px_40px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="grid grid-cols-6 items-center">
          {(
            [
              { id: 'dashboard', label: 'Today', Icon: Activity },
              { id: 'journal', label: 'Journal', Icon: BookOpen },
              { id: 'scan', label: 'Scan', Icon: Camera },
              { id: 'math', label: 'Math', Icon: Calculator },
              { id: 'quests', label: 'Ranks', Icon: Trophy },
              { id: 'settings', label: 'Config', Icon: Settings },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="relative flex flex-col items-center justify-center py-1 group"
              >
                <div className="relative px-3.5 py-1.5 rounded-full flex items-center justify-center">
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
