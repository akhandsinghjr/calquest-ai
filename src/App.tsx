import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  Apple,
  Award,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Compass,
  Crown,
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
  Utensils,
  Wheat,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type {
  Badge,
  BiometricsProfile,
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
  loadMeals,
  loadUserState,
  saveMeals,
  saveUserState,
} from './services/storage';

type NavTab = 'dashboard' | 'scan' | 'math' | 'quests' | 'settings';

const M3_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

const M3_SOFT_SPRING = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 28,
};

function RenderVectorIcon({
  name,
  className = 'w-4 h-4',
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

  useEffect(() => {
    saveMeals(meals);
  }, [meals]);

  useEffect(() => {
    saveUserState(userState);
  }, [userState]);

  const todayKey = getLocalDateKey();
  const todayMeals = useMemo(
    () => meals.filter((m) => m.dateKey === todayKey),
    [meals, todayKey]
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

  // SVG Calorie Ring Geometry
  const ringRadius = 60;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringStrokeDashoffset =
    ringCircumference - (caloriePercent / 100) * ringCircumference;

  return (
    <div className="min-h-[100dvh] bg-m3-surface text-slate-100 flex flex-col max-w-md mx-auto relative overflow-x-hidden selection:bg-emerald-500/30 border-x border-white/[0.04]">
      {/* Subtle Material 3 Atmospheric Top Glow */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 max-w-md mx-auto z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -15%, rgba(16, 185, 129, 0.14), transparent 70%)',
        }}
      />

      {/* TOP MATERIAL 3 EXPRESSIVE APP BAR */}
      <header className="sticky top-0 z-30 backdrop-blur-2xl bg-m3-surface/85 border-b border-white/[0.06] px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[18px] bg-m3-primaryContainer border border-emerald-400/20 flex items-center justify-center text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              <RenderVectorIcon name={levelInfo.rankIcon} className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tabular-nums uppercase tracking-widest px-2 py-0.5 rounded-full bg-m3-primaryContainer text-m3-onPrimaryContainer border border-emerald-400/20 font-semibold">
                  LVL {levelInfo.level}
                </span>
                <span className="text-sm font-display font-bold text-slate-100 tracking-tight">
                  {levelInfo.rankTitle}
                </span>
              </div>
              <div className="w-36 h-1.5 bg-m3-surfaceHighest rounded-full overflow-hidden mt-1.5">
                <motion.div
                  className="h-full bg-emerald-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${levelInfo.progressPercent}%` }}
                  transition={M3_SOFT_SPRING}
                />
              </div>
              <p className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP
              </p>
            </div>
          </div>

          {/* Streak Tonal Pill */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-m3-surfaceContainer border border-white/[0.07] px-3.5 py-2 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <Flame
                className={`w-4 h-4 ${
                  userState.streakDays > 0
                    ? 'text-amber-400'
                    : 'text-slate-500'
                }`}
              />
              <div className="leading-none">
                <span className="text-xs font-mono tabular-nums font-semibold text-white">
                  {userState.streakDays}d
                </span>
                <span className="text-[10px] text-slate-400 block">streak</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN SCROLLABLE VIEWPORT */}
      <main className="flex-1 px-4 pt-4 pb-28 relative z-10">
        {!hasApiKeyConfigured && activeTab !== 'settings' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={M3_SPRING}
            className="mb-4 p-4 rounded-[24px] bg-m3-surfaceContainer border border-amber-400/25 flex items-center justify-between gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center text-amber-300 shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-display font-semibold text-slate-100">
                  Configure API Key
                </p>
                <p className="text-[11px] text-slate-400">
                  Add your personal key in Settings to enable instant photo analysis.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-3.5 py-2 rounded-full bg-amber-400 text-slate-950 text-xs font-display font-bold shrink-0 active:scale-95 transition-transform"
            >
              Setup
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* MATERIAL 3 EXPRESSIVE HERO BENTO CONTAINER */}
              <section className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 block">
                      Daily Energy Ledger
                    </span>
                    <h1 className="text-lg font-display font-bold text-white tracking-tight">
                      Metabolic Balance
                    </h1>
                  </div>
                  <button
                    onClick={() => setActiveTab('math')}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-slate-200 border border-white/[0.07] active:scale-95 transition-all"
                  >
                    <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Body Math</span>
                  </button>
                </div>

                <div className="flex items-center gap-5">
                  {/* Expressive Radial Calorie Gauge */}
                  <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                      <circle
                        cx="70"
                        cy="70"
                        r={ringRadius}
                        stroke="rgba(255, 255, 255, 0.06)"
                        strokeWidth="12"
                        fill="transparent"
                      />
                      <motion.circle
                        cx="70"
                        cy="70"
                        r={ringRadius}
                        stroke={caloriesRemaining >= 0 ? '#10b981' : '#f43f5e'}
                        strokeWidth="12"
                        strokeDasharray={ringCircumference}
                        initial={{ strokeDashoffset: ringCircumference }}
                        animate={{ strokeDashoffset: ringStrokeDashoffset }}
                        transition={M3_SOFT_SPRING}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
                        {caloriesRemaining >= 0 ? 'Remaining' : 'Over Target'}
                      </span>
                      <span className="text-2xl font-mono tabular-nums font-bold text-white tracking-tight mt-0.5">
                        {Math.abs(caloriesRemaining)}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400">
                        of {userState.goals.dailyCalories} kcal
                      </span>
                    </div>
                  </div>

                  {/* Macro Distribution Bars */}
                  <div className="flex-1 space-y-3">
                    {[
                      {
                        label: 'Protein',
                        current: todayTotals.protein,
                        target: userState.goals.proteinGrams,
                        barClass: 'bg-emerald-400',
                        textClass: 'text-emerald-300',
                      },
                      {
                        label: 'Carbohydrates',
                        current: todayTotals.carbs,
                        target: userState.goals.carbsGrams,
                        barClass: 'bg-sky-400',
                        textClass: 'text-sky-300',
                      },
                      {
                        label: 'Dietary Fat',
                        current: todayTotals.fat,
                        target: userState.goals.fatGrams,
                        barClass: 'bg-amber-400',
                        textClass: 'text-amber-300',
                      },
                      {
                        label: 'Fiber',
                        current: todayTotals.fiber,
                        target: userState.goals.fiberGrams,
                        barClass: 'bg-teal-400',
                        textClass: 'text-teal-300',
                      },
                    ].map((macro) => {
                      const pct = Math.min(
                        100,
                        Math.round((macro.current / Math.max(1, macro.target)) * 100)
                      );
                      return (
                        <div key={macro.label}>
                          <div className="flex justify-between items-baseline text-xs mb-1">
                            <span className="text-slate-300 font-medium">{macro.label}</span>
                            <span className={`font-mono tabular-nums text-[11px] ${macro.textClass}`}>
                              {macro.current}g{' '}
                              <span className="text-slate-500">/ {macro.target}g</span>
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-m3-surfaceLow rounded-full overflow-hidden">
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

                {/* Secondary Metric Ledger Strip */}
                <div className="mt-5 pt-3.5 border-t border-white/[0.06] grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Consumed
                    </span>
                    <span className="text-sm font-mono tabular-nums font-semibold text-white">
                      {todayTotals.calories} kcal
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Meals Logged
                    </span>
                    <span className="text-sm font-mono tabular-nums font-semibold text-white">
                      {todayMeals.length} today
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Protection
                    </span>
                    <span className="text-sm font-mono tabular-nums font-semibold text-emerald-300">
                      {userState.streakFreezes} shields
                    </span>
                  </div>
                </div>
              </section>

              {/* PRIMARY EXPRESSIVE SCAN ACTION */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab('scan')}
                className="w-full p-4 rounded-[24px] bg-m3-primaryContainer hover:bg-emerald-900/60 border border-emerald-400/25 flex items-center justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-[18px] bg-emerald-400 text-slate-950 flex items-center justify-center shadow-sm">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-sm font-display font-bold text-white tracking-tight">
                      Scan Meal Photo
                    </h2>
                    <p className="text-xs text-emerald-200/80">
                      Multimodal portion & macronutrient breakdown (+50-100 XP)
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-emerald-200 group-hover:translate-x-0.5 transition-transform">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </motion.button>

              {/* ACTIVE QUESTS COMPACT LEDGER */}
              <section className="rounded-[26px] bg-m3-surfaceContainer border border-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-xs font-display font-bold uppercase tracking-wider text-slate-200">
                      Daily Objectives
                    </h2>
                  </div>
                  <button
                    onClick={() => setActiveTab('quests')}
                    className="text-[11px] text-emerald-400 font-medium hover:underline"
                  >
                    All Ranks & Badges
                  </button>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {dailyQuests.map((q) => {
                    const claimed = (
                      userState.claimedQuestIdsByDate[todayKey] || []
                    ).includes(q.id);
                    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                    return (
                      <div
                        key={q.id}
                        className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              q.completed
                                ? 'bg-m3-primaryContainer border-emerald-400/30 text-emerald-300'
                                : 'bg-m3-surfaceHigh border-white/[0.06] text-slate-400'
                            }`}
                          >
                            <RenderVectorIcon name={q.icon} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-display font-semibold text-white truncate">
                                {q.title}
                              </p>
                              <span className="text-[10px] font-mono tabular-nums text-emerald-400 shrink-0">
                                +{q.xpReward} XP
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {q.description}
                            </p>
                            <div className="w-full h-1 bg-m3-surfaceLow rounded-full overflow-hidden mt-1.5">
                              <motion.div
                                className="h-full bg-emerald-400 rounded-full"
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
                            className="px-3 py-1.5 rounded-full bg-emerald-400 text-slate-950 font-display font-bold text-[11px] shrink-0 active:scale-95 transition-transform"
                          >
                            Claim
                          </button>
                        ) : claimed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 shrink-0">
                            <Check className="w-3.5 h-3.5" /> Done
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                            {q.progress}/{q.target}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* TODAY'S LOGGED MEALS */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
                    Logged Meals ({todayMeals.length})
                  </h2>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {todayKey}
                  </span>
                </div>

                {todayMeals.length === 0 ? (
                  <div className="rounded-[26px] bg-m3-surfaceContainer border border-white/[0.06] p-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-m3-surfaceHigh border border-white/[0.07] flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-display font-semibold text-slate-200">
                      No meals logged yet today
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Capture a photo of your plate or drink to compute itemized calories and macros.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {todayMeals.map((meal) => (
                      <motion.div
                        key={meal.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-[24px] bg-m3-surfaceContainer border border-white/[0.07] p-3.5 flex gap-3.5 items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      >
                        {meal.photoDataUrl ? (
                          <img
                            src={meal.photoDataUrl}
                            alt={meal.mealName}
                            className="w-16 h-16 rounded-[18px] object-cover shrink-0 border border-white/[0.08]"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-[18px] bg-m3-surfaceHigh flex items-center justify-center text-emerald-300 shrink-0 border border-white/[0.07]">
                            <RenderVectorIcon name={meal.mealType} className="w-6 h-6" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-m3-surfaceHigh text-slate-300 font-medium">
                              {meal.mealType}
                            </span>
                            <span className="text-[10px] font-mono tabular-nums text-emerald-400">
                              Score {meal.healthScore}
                            </span>
                          </div>
                          <h3 className="text-sm font-display font-bold text-white truncate mt-1">
                            {meal.mealName}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-[11px] font-mono tabular-nums">
                            <span className="text-white font-semibold">
                              {meal.totalCalories} kcal
                            </span>
                            <span className="text-emerald-300">P {meal.macros.proteinGrams}g</span>
                            <span className="text-sky-300">C {meal.macros.carbsGrams}g</span>
                            <span className="text-amber-300">F {meal.macros.fatGrams}g</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteMeal(meal.id)}
                          className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
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

          {/* TAB 2: SCAN & MULTIMODAL VISION */}
          {activeTab === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 block">
                  Multimodal Food Vision
                </span>
                <h1 className="text-lg font-display font-bold text-white tracking-tight mt-0.5">
                  Visual Calorie & Macro Analyzer
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Snap a meal photo or choose from your gallery for itemized portion and nutrition analysis.
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
                <div className="grid grid-cols-4 gap-1.5 mt-4 p-1 rounded-2xl bg-m3-surfaceLow border border-white/[0.05]">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((type) => {
                    const active = mealType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setMealType(type)}
                        className={`relative py-2 rounded-xl text-xs font-display font-semibold capitalize transition-colors z-10 flex items-center justify-center gap-1.5 ${
                          active ? 'text-slate-950' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="m3-meal-type-pill"
                            transition={M3_SPRING}
                            className="absolute inset-0 rounded-xl bg-emerald-400 -z-10"
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
                  <div className="mt-4 border border-dashed border-white/[0.14] rounded-[24px] p-7 text-center bg-m3-surfaceLow">
                    <div className="w-14 h-14 rounded-[20px] bg-m3-primaryContainer border border-emerald-400/25 flex items-center justify-center mx-auto mb-3 text-emerald-300">
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-display font-semibold text-slate-200 mb-1">
                      Capture Your Plate
                    </p>
                    <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
                      Keep the entire plate or nutrition label clearly visible for optimal portion depth estimation.
                    </p>
                    <div className="flex gap-2.5 justify-center">
                      <button
                        onClick={() => handleTakePhoto('camera')}
                        className="px-4 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-bold text-xs flex items-center gap-2 active:scale-95 transition-all"
                      >
                        <Camera className="w-4 h-4" />
                        Open Camera
                      </button>
                      <button
                        onClick={() => handleTakePhoto('gallery')}
                        className="px-4 py-2.5 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest text-slate-200 border border-white/[0.08] font-display font-semibold text-xs flex items-center gap-2 active:scale-95 transition-all"
                      >
                        <ImageIcon className="w-4 h-4" />
                        Gallery
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="relative rounded-[22px] overflow-hidden border border-white/[0.1] bg-black">
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
                        className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-black border border-white/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Optional Context Note (e.g. cooked in 1 tbsp olive oil, air-fried)
                      </label>
                      <input
                        type="text"
                        value={userNote}
                        onChange={(e) => setUserNote(e.target.value)}
                        placeholder="Add preparation details or hidden ingredients..."
                        className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    {!analysisResult && (
                      <button
                        onClick={handleRunGeminiAnalysis}
                        disabled={isAnalyzing}
                        className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyzing Portions & Macros...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Calculate Calories & Macros
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {scanError && (
                  <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-200 text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-display font-semibold">Analysis Error</p>
                      <p className="text-rose-300/90 mt-0.5">{scanError}</p>
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
                  className="rounded-[28px] bg-m3-surfaceContainer border border-emerald-400/25 p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[18px] bg-m3-primaryContainer border border-emerald-400/25 flex items-center justify-center text-emerald-300 shrink-0">
                        <Utensils className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-m3-primaryContainer text-m3-onPrimaryContainer border border-emerald-400/20">
                            Health Score {analysisResult.healthScore}/100
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-m3-surfaceHigh text-slate-300">
                            {analysisResult.confidence} confidence
                          </span>
                        </div>
                        <h3 className="text-base font-display font-bold text-white mt-1">
                          {analysisResult.mealName}
                        </h3>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-2xl font-mono tabular-nums font-bold text-emerald-400">
                        {adjustedAnalysis.totalCalories}
                      </span>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">
                        kcal
                      </span>
                    </div>
                  </div>

                  {/* Nutritionist Feedback */}
                  <div className="p-3.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.06] text-xs text-slate-300 leading-relaxed">
                    {analysisResult.wittyFeedback}
                  </div>

                  {/* Macro Summary Strip */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      {
                        label: 'Protein',
                        val: `${adjustedAnalysis.macros.proteinGrams}g`,
                        color: 'text-emerald-300',
                      },
                      {
                        label: 'Carbs',
                        val: `${adjustedAnalysis.macros.carbsGrams}g`,
                        color: 'text-sky-300',
                      },
                      {
                        label: 'Fat',
                        val: `${adjustedAnalysis.macros.fatGrams}g`,
                        color: 'text-amber-300',
                      },
                      {
                        label: 'Fiber',
                        val: `${adjustedAnalysis.macros.fiberGrams}g`,
                        color: 'text-teal-300',
                      },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="p-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.05] text-center"
                      >
                        <span className="text-[10px] text-slate-400 block">{m.label}</span>
                        <span className={`text-sm font-mono tabular-nums font-bold ${m.color}`}>
                          {m.val}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Portion Multiplier Control */}
                  <div className="p-3.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.05]">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-300 font-medium">Portion Scale</span>
                      <span className="font-mono tabular-nums text-emerald-400 font-bold">
                        {Math.round(portionMultiplier * 100)}% ({portionMultiplier}x)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.25"
                      value={portionMultiplier}
                      onChange={(e) => setPortionMultiplier( parseFloat(e.target.value) )}
                      className="w-full accent-emerald-400"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                      <span>0.5x</span>
                      <span>1.0x</span>
                      <span>1.5x</span>
                      <span>2.0x</span>
                    </div>
                  </div>

                  {/* Itemized Food Components Ledger (divide-y instead of boxy bloat) */}
                  <div>
                    <p className="text-[11px] font-display font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Detected Components (Tap to toggle)
                    </p>
                    <div className="rounded-2xl bg-m3-surfaceLow border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
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
                            className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left transition-opacity ${
                              included ? 'opacity-100' : 'opacity-40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                                  included
                                    ? 'bg-emerald-400 border-emerald-400 text-slate-950'
                                    : 'border-slate-600'
                                }`}
                              >
                                {included && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-medium text-white truncate">
                                  {item.name}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400">
                                  {item.portionEstimate} • P {item.proteinGrams}g • C{' '}
                                  {item.carbsGrams}g • F {item.fatGrams}g
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-mono tabular-nums font-semibold text-slate-200 shrink-0 ml-2">
                              {Math.round(item.calories * portionMultiplier)} kcal
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmLogMeal}
                    className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Log Meal (+{calculateMealXp(analysisResult.healthScore).totalXp} XP)
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* TAB 3: SCIENTIFIC BODY MATH CALCULATOR */}
          {activeTab === 'math' && (
            <motion.div
              key="math"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* Biomathematical Output Summary Card */}
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 block">
                      Hall (Lancet 2011) + Forbes (1987)
                    </span>
                    <h1 className="text-lg font-display font-bold text-white tracking-tight mt-0.5">
                      Biomathematical Target Engine
                    </h1>
                  </div>
                  <button
                    onClick={() => setShowFormulaSheet((v) => !v)}
                    className="px-3 py-1.5 rounded-full bg-m3-surfaceHigh text-slate-200 border border-white/[0.07] text-[11px] font-medium flex items-center gap-1.5"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-400" />
                    {showFormulaSheet ? 'Hide Papers' : 'Formulas'}
                  </button>
                </div>

                {/* Primary Computed Intake Banner */}
                <div className="mt-4 p-4 rounded-[22px] bg-m3-primaryContainer border border-emerald-400/25 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-200/80 block">
                      Optimal Daily Intake
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-3xl font-mono tabular-nums font-bold text-white">
                        {metabolicResult.targetDailyCalories}
                      </span>
                      <span className="text-xs font-mono text-emerald-200">kcal / day</span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-emerald-200/90 mt-1 block">
                      {metabolicResult.dailyCalorieDelta === 0
                        ? 'Isocaloric Maintenance'
                        : metabolicResult.dailyCalorieDelta < 0
                        ? `${metabolicResult.dailyCalorieDelta} kcal/day deficit (${metabolicResult.weeklyRateKg} kg/wk)`
                        : `+${metabolicResult.dailyCalorieDelta} kcal/day surplus (+${metabolicResult.weeklyRateKg} kg/wk)`}
                    </span>
                  </div>

                  <button
                    onClick={handleApplyScientificTargets}
                    className="px-4 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-bold text-xs shrink-0 active:scale-95 transition-all"
                  >
                    Apply Target
                  </button>
                </div>

                {mathAppliedToast && (
                  <div className="mt-3 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Daily calorie and macro targets updated on your dashboard.</span>
                  </div>
                )}

                {/* Scientific Ledger Rows (divide-y instead of bloated sub-cards) */}
                <div className="mt-4 rounded-[22px] bg-m3-surfaceLow border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Resting Metabolic Rate (RMR)</span>
                    <span className="font-mono tabular-nums text-white font-semibold">
                      {metabolicResult.activeRmr} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Maintenance TDEE (PAL ×{metabolicResult.pal.toFixed(2)})
                    </span>
                    <span className="font-mono tabular-nums text-sky-300 font-semibold">
                      {metabolicResult.tdee} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Forbes Lean Partitioning Ratio (p)
                    </span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {(metabolicResult.forbesPartitionP * 100).toFixed(1)}% LBM /{' '}
                      {((1 - metabolicResult.forbesPartitionP) * 100).toFixed(1)}% FM
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Effective Tissue Energy Density (ρ_eff)
                    </span>
                    <span className="font-mono tabular-nums text-amber-300 font-semibold">
                      {metabolicResult.effectiveEnergyDensityKcalPerKg} kcal/kg
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Hall Dynamic Thermogenesis (ε = 22)
                    </span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {metabolicResult.metabolicAdaptationKcal >= 0 ? '+' : ''}
                      {metabolicResult.metabolicAdaptationKcal} kcal/d
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Body Composition Estimate</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {metabolicResult.leanMassKg}kg LBM ({metabolicResult.estimatedBodyFatPct}% BF)
                    </span>
                  </div>
                </div>

                {/* Computed Macro Prescription Bar */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[
                    {
                      label: 'Protein',
                      val: `${metabolicResult.recommendedMacros.proteinGrams}g`,
                      sub: 'Morton 2018',
                      color: 'text-emerald-300',
                    },
                    {
                      label: 'Carbs',
                      val: `${metabolicResult.recommendedMacros.carbsGrams}g`,
                      sub: 'Glycogen',
                      color: 'text-sky-300',
                    },
                    {
                      label: 'Fat',
                      val: `${metabolicResult.recommendedMacros.fatGrams}g`,
                      sub: 'Helms 2014',
                      color: 'text-amber-300',
                    },
                    {
                      label: 'Fiber',
                      val: `${metabolicResult.recommendedMacros.fiberGrams}g`,
                      sub: '14g/1000kcal',
                      color: 'text-teal-300',
                    },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="p-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.05] text-center"
                    >
                      <span className="text-[10px] text-slate-400 block">{m.label}</span>
                      <span className={`text-sm font-mono tabular-nums font-bold ${m.color}`}>
                        {m.val}
                      </span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">{m.sub}</span>
                    </div>
                  ))}
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
                      <div className="mt-4 p-4 rounded-2xl bg-m3-surfaceLow border border-white/[0.07] space-y-2.5 text-[11px] text-slate-300 leading-relaxed">
                        <p className="font-display font-bold text-emerald-300">
                          Peer-Reviewed Biomathematical Formulation
                        </p>
                        <p>
                          <strong className="text-white">1. Basal Expenditure:</strong>{' '}
                          Mifflin-St Jeor (1990) & Katch-McArdle (1973) lean-mass hybrid:
                          <span className="block font-mono text-[10px] text-slate-400 mt-0.5">
                            RMR = 10W + 6.25H - 5A + s | RMR_LBM = 370 + 21.6(LBM)
                          </span>
                        </p>
                        <p>
                          <strong className="text-white">2. Forbes Partitioning (1987):</strong>{' '}
                          Non-linear fraction of weight change from lean vs adipose tissue:
                          <span className="block font-mono text-[10px] text-slate-400 mt-0.5">
                            p = C / (C + FM), C = 10.4 * (rho_L / rho_F) = 1.996 kg
                          </span>
                        </p>
                        <p>
                          <strong className="text-white">
                            3. Hall et al. (The Lancet, 2011):
                          </strong>{' '}
                          Replaces the static 3,500 kcal rule with dynamic adaptation (ε = 22 kcal/kg/d):
                          <span className="block font-mono text-[10px] text-slate-400 mt-0.5">
                            Delta_E = [rho_eff * (Delta_W / t)] + [0.5 * 22 * Delta_W]
                          </span>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Biometric Input Controls */}
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-display font-bold text-white">
                    Your Biometric Parameters
                  </h2>
                </div>

                {/* Sex & Resistance Training Toggle */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-1 rounded-2xl bg-m3-surfaceLow border border-white/[0.06] grid grid-cols-2">
                    {(['male', 'female'] as const).map((sex) => (
                      <button
                        key={sex}
                        onClick={() => setBiometricsDraft((b) => ({ ...b, sex }))}
                        className={`py-2 rounded-xl text-xs font-display font-semibold capitalize transition-colors ${
                          biometricsDraft.sex === sex
                            ? 'bg-emerald-400 text-slate-950 font-bold'
                            : 'text-slate-400'
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
                    className={`px-3 py-2 rounded-2xl border text-xs font-display font-semibold flex items-center justify-center gap-2 transition-colors ${
                      biometricsDraft.resistanceTraining
                        ? 'bg-m3-primaryContainer border-emerald-400/30 text-emerald-300'
                        : 'bg-m3-surfaceLow border-white/[0.06] text-slate-400'
                    }`}
                  >
                    <Dumbbell className="w-3.5 h-3.5" />
                    <span>Lifting: {biometricsDraft.resistanceTraining ? 'Yes' : 'No'}</span>
                  </button>
                </div>

                {/* Numeric Parameters Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Age (years)</label>
                    <input
                      type="number"
                      value={biometricsDraft.age}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          age: Number(e.target.value) || 25,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Height (cm)</label>
                    <input
                      type="number"
                      value={biometricsDraft.heightCm}
                      onChange={(e) =>
                        setBiometricsDraft((b) => ({
                          ...b,
                          heightCm: Number(e.target.value) || 175,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Current Weight (kg)
                    </label>
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
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
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
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-emerald-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Timeline (weeks)
                    </label>
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
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Body Fat % (Optional)
                    </label>
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
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white placeholder-slate-500"
                    />
                  </div>
                </div>

                {/* Activity Level List */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-2">
                    Physical Activity Level (FAO/WHO/UNU PAL)
                  </label>
                  <div className="space-y-1.5">
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
                          className={`w-full px-3.5 py-2.5 rounded-2xl border text-left flex items-center justify-between transition-colors ${
                            active
                              ? 'bg-m3-primaryContainer border-emerald-400/35 text-white'
                              : 'bg-m3-surfaceLow border-white/[0.05] text-slate-300 hover:bg-m3-surfaceHigh'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-display font-semibold">{item.label}</p>
                            <p className="text-[10px] text-slate-400">{item.desc}</p>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-emerald-300 font-semibold">
                            ×{item.pal.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
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
              {/* Player Progression Card */}
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-[20px] bg-m3-primaryContainer border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                    <RenderVectorIcon name={levelInfo.rankIcon} className="w-7 h-7" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                      Level {levelInfo.level} Progression
                    </span>
                    <h1 className="text-xl font-display font-bold text-white tracking-tight">
                      {levelInfo.rankTitle}
                    </h1>
                    <p className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
                      Total XP: {userState.xp} • Longest Streak: {userState.longestStreak}d
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mb-1.5">
                    <span>Level {levelInfo.level}</span>
                    <span>
                      {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP (
                      {levelInfo.progressPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-m3-surfaceLow rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${levelInfo.progressPercent}%` }}
                      transition={M3_SOFT_SPRING}
                    />
                  </div>
                </div>
              </div>

              {/* Badges Grid */}
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-display font-bold text-white">
                      Mastery Badges
                    </h2>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {userState.unlockedBadgeIds.length} / {ALL_BADGES.length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {ALL_BADGES.map((badge) => {
                    const unlocked = userState.unlockedBadgeIds.includes(badge.id);
                    return (
                      <div
                        key={badge.id}
                        className={`p-3.5 rounded-[22px] border transition-all ${
                          unlocked
                            ? 'bg-m3-primaryContainer/60 border-emerald-400/30 text-white'
                            : 'bg-m3-surfaceLow border-white/[0.05] text-slate-500 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                              unlocked
                                ? 'bg-emerald-400/20 border-emerald-400/30 text-emerald-300'
                                : 'bg-m3-surfaceContainer border-white/[0.05] text-slate-500'
                            }`}
                          >
                            <RenderVectorIcon name={badge.icon} className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-emerald-400 font-semibold">
                            +{badge.xpReward} XP
                          </span>
                        </div>
                        <h3 className="text-xs font-display font-bold text-slate-100">
                          {badge.title}
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                          {badge.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: SETTINGS & API DIAGNOSTICS */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={M3_SPRING}
              className="space-y-4"
            >
              {/* API Configuration Card */}
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <h1 className="text-base font-display font-bold text-white">
                    Vision API Connection
                  </h1>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Paste your personal Gemini API key from Google AI Studio. Includes automatic multi-model failover so high-demand 503 spikes never interrupt meal logging.
                </p>

                {hasBuiltInApiKey() && !localStorage.getItem('calquest_gemini_api_key') && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Built-in environment key detected and active.</span>
                  </div>
                )}

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full pl-3.5 pr-10 py-3 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTestApiConnection}
                    disabled={testingApi}
                    className="flex-1 py-2.5 px-4 rounded-full bg-m3-surfaceHigh hover:bg-m3-surfaceHighest border border-white/[0.08] text-xs font-display font-semibold text-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    {testingApi ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        Verify Connection
                      </>
                    )}
                  </button>
                </div>

                {apiTestResult && (
                  <div
                    className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                      apiTestResult.ok
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    {apiTestResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-display font-semibold">
                        {apiTestResult.ok ? 'API Ready' : 'Connection Error'}
                      </p>
                      <p className="font-mono text-[11px] opacity-90 mt-0.5">
                        {apiTestResult.message} ({apiTestResult.latencyMs}ms)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Daily Goals Override */}
              <div className="rounded-[28px] bg-m3-surfaceContainer border border-white/[0.07] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-display font-bold text-white">
                      Daily Targets & Prompt Context
                    </h2>
                  </div>
                  <button
                    onClick={() => setActiveTab('math')}
                    className="text-[11px] text-emerald-400 font-medium hover:underline"
                  >
                    Calculate via Body Math
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
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
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Protein Target (g)
                    </label>
                    <input
                      type="number"
                      value={goalsDraft.proteinGrams}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          proteinGrams: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Carbohydrates (g)
                    </label>
                    <input
                      type="number"
                      value={goalsDraft.carbsGrams}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          carbsGrams: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Dietary Fat (g)
                    </label>
                    <input
                      type="number"
                      value={goalsDraft.fatGrams}
                      onChange={(e) =>
                        setGoalsDraft((g) => ({
                          ...g,
                          fatGrams: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-sm font-mono tabular-nums text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Personal Culinary Context (sent with every photo scan)
                  </label>
                  <textarea
                    rows={2}
                    value={customPromptDraft}
                    onChange={(e) => setCustomPromptDraft(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-m3-surfaceLow border border-white/[0.08] text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Save Configuration
                </button>

                {settingsSavedToast && (
                  <p className="text-xs text-emerald-400 text-center font-medium">
                    Configuration saved.
                  </p>
                )}
              </div>

              {/* Reset Data */}
              <div className="rounded-[24px] bg-m3-surfaceContainer border border-white/[0.06] p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-semibold text-slate-200">
                    Reset Local Logs
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Clear meal history and XP stored on this device.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all logged meals and XP?')) {
                      clearAllData();
                      setMeals(loadMeals());
                      setUserState(loadUserState());
                    }
                  }}
                  className="px-3.5 py-2 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-display font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* MATERIAL 3 EXPRESSIVE FLOATING PILL NAVIGATION BAR */}
      <nav className="fixed bottom-3 inset-x-4 max-w-[calc(28rem-2rem)] mx-auto z-40 rounded-[28px] bg-m3-surfaceContainer/95 backdrop-blur-2xl border border-white/[0.09] px-2 py-2 shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="grid grid-cols-5 items-center">
          {(
            [
              { id: 'dashboard', label: 'Home', Icon: Activity },
              { id: 'math', label: 'Math', Icon: Calculator },
              { id: 'scan', label: 'Scan', Icon: Camera },
              { id: 'quests', label: 'Ranks', Icon: Trophy },
              { id: 'settings', label: 'Config', Icon: Settings },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="relative flex flex-col items-center justify-center py-1.5 group"
              >
                <div className="relative px-4 py-1 rounded-full flex items-center justify-center">
                  {active && (
                    <motion.div
                      layoutId="m3-bottom-nav-pill"
                      transition={M3_SPRING}
                      className="absolute inset-0 rounded-full bg-m3-primaryContainer border border-emerald-400/25"
                    />
                  )}
                  <Icon
                    className={`w-4 h-4 relative z-10 transition-colors ${
                      active
                        ? 'text-emerald-300'
                        : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                </div>
                <span
                  className={`text-[10px] font-display mt-1 transition-colors ${
                    active ? 'text-emerald-300 font-bold' : 'text-slate-400 font-medium'
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
              className="w-full max-w-xs rounded-[28px] bg-m3-surfaceContainer border border-emerald-400/30 p-6 text-center space-y-4 shadow-2xl"
            >
              <div className="w-14 h-14 rounded-[20px] bg-m3-primaryContainer border border-emerald-400/30 flex items-center justify-center mx-auto text-emerald-300">
                <Zap className="w-7 h-7" />
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                  Progress Recorded
                </span>
                <h3 className="text-2xl font-mono tabular-nums font-bold text-white mt-0.5">
                  +{celebrationData.xpGained} XP
                </h3>
                {celebrationData.leveledUp && (
                  <p className="text-xs font-display font-semibold text-amber-300 mt-1">
                    Level {celebrationData.newLevel} Reached
                  </p>
                )}
              </div>

              {celebrationData.newBadges.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    New Badge Unlocked
                  </p>
                  {celebrationData.newBadges.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-2xl bg-m3-surfaceLow border border-emerald-400/20 flex items-center gap-2.5 text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-m3-primaryContainer flex items-center justify-center text-emerald-300 shrink-0">
                        <RenderVectorIcon name={b.icon} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-display font-bold text-white">{b.title}</p>
                        <p className="text-[10px] text-slate-400">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setCelebrationData(null)}
                className="w-full py-3 rounded-full bg-emerald-400 text-slate-950 font-display font-bold text-xs active:scale-95 transition-transform"
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
