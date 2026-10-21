import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Award,
  Calculator,
  Camera,
  Check,
  ChevronDown,
  Download,
  Flame,
  History,
  Image as ImageIcon,
  KeyRound,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type {
  Badge,
  GeminiMealAnalysis,
  MealLog,
  UserState,
} from './types';
import {
  analyzeFoodPhotoWithGemini,
  getStoredApiKey,
  hasBuiltInApiKey,
  setStoredApiKey,
  testGeminiConnection,
} from './services/geminiService';
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
  ACTIVITY_MULTIPLIERS,
  calculateScientificTargets,
} from './services/metabolicMath';
import {
  capturePhotoFromNativeOrWeb,
  readFileAsCapturedImage,
  type CapturedImage,
} from './utils/imageUtils';
import { cn } from './utils/cn';

const STORAGE_KEY_STATE = 'calquest_user_state_v2';
const STORAGE_KEY_MEALS = 'calquest_meals_v1';

const DEFAULT_USER_STATE: UserState = {
  xp: 0,
  streakDays: 0,
  longestStreak: 0,
  lastLoggedDate: null,
  streakFreezes: 1,
  unlockedBadgeIds: [],
  claimedQuestIdsByDate: {},
  goals: {
    dailyCalories: 2050,
    proteinGrams: 150,
    carbsGrams: 200,
    fatGrams: 68,
    fiberGrams: 29,
  },
  biometrics: {
    sex: 'male',
    age: 24,
    heightCm: 176,
    weightKg: 78,
    targetWeightKg: 72,
    targetTimelineWeeks: 12,
    activityLevel: 'moderate',
    resistanceTraining: true,
  },
  customPromptInstruction: '',
};

export function App() {
  const [activeTab, setActiveTab] = useState<'today' | 'plan' | 'quests' | 'settings'>('today');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);

  const [userState, setUserState] = useState<UserState>(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY_STATE) ||
        localStorage.getItem('calquest_user_state_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_USER_STATE,
          ...parsed,
          goals: { ...DEFAULT_USER_STATE.goals, ...(parsed.goals || {}) },
          biometrics: { ...DEFAULT_USER_STATE.biometrics, ...(parsed.biometrics || {}) },
        };
      }
    } catch {
      // ignore parse errors
    }
    return DEFAULT_USER_STATE;
  });

  const [meals, setMeals] = useState<MealLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MEALS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore parse errors
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(userState));
    } catch (e) {
      console.error('Failed to save user state:', e);
    }
  }, [userState]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(meals));
    } catch (e) {
      console.error('Failed to save meals:', e);
    }
  }, [meals]);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 22) return 'dinner';
    return 'snack';
  });
  const [userNote, setUserNote] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<GeminiMealAnalysis | null>(null);
  const [portionMultiplier, setPortionMultiplier] = useState<number>(1);

  // Toast notification
  const [celebrationToast, setCelebrationToast] = useState<{
    title: string;
    subtitle: string;
    xp: number;
  } | null>(null);

  // Settings state
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsSavedBanner, setSettingsSavedBanner] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);

  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);

  const todayKey = getLocalDateKey();

  const todayMeals = useMemo(
    () => meals.filter((m) => m.dateKey === todayKey),
    [meals, todayKey]
  );

  const todayTotals = useMemo(() => {
    return todayMeals.reduce(
      (acc, meal) => {
        acc.calories += meal.totalCalories;
        acc.protein += meal.macros.proteinGrams;
        acc.carbs += meal.macros.carbsGrams;
        acc.fat += meal.macros.fatGrams;
        acc.fiber += meal.macros.fiberGrams;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [todayMeals]);

  const levelInfo = useMemo(() => getLevelInfo(userState.xp), [userState.xp]);

  const dailyQuests = useMemo(
    () => computeDailyQuests(todayMeals, userState.goals),
    [todayMeals, userState.goals]
  );

  const claimedTodaySet = useMemo(
    () => new Set(userState.claimedQuestIdsByDate[todayKey] || []),
    [userState.claimedQuestIdsByDate, todayKey]
  );

  // Scientific metabolic calculation result
  const metabolicPlan = useMemo(
    () => calculateScientificTargets(userState.biometrics),
    [userState.biometrics]
  );

  const adjustedAnalysis = useMemo(() => {
    if (!analysisResult) return null;
    const includedItems = analysisResult.items.filter((i) => i.included !== false);
    const hasItems = analysisResult.items.length > 0;

    const rawCals = hasItems
      ? includedItems.reduce((s, i) => s + i.calories, 0)
      : analysisResult.totalCalories;
    const rawProtein = hasItems
      ? includedItems.reduce((s, i) => s + i.proteinGrams, 0)
      : analysisResult.macros.proteinGrams;
    const rawCarbs = hasItems
      ? includedItems.reduce((s, i) => s + i.carbsGrams, 0)
      : analysisResult.macros.carbsGrams;
    const rawFat = hasItems
      ? includedItems.reduce((s, i) => s + i.fatGrams, 0)
      : analysisResult.macros.fatGrams;

    return {
      totalCalories: Math.round(rawCals * portionMultiplier),
      macros: {
        proteinGrams: Math.round(rawProtein * portionMultiplier),
        carbsGrams: Math.round(rawCarbs * portionMultiplier),
        fatGrams: Math.round(rawFat * portionMultiplier),
        fiberGrams: Math.round(analysisResult.macros.fiberGrams * portionMultiplier),
      },
    };
  }, [analysisResult, portionMultiplier]);

  function triggerConfetti() {
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.72 },
      });
    } catch {
      // ignore
    }
  }

  function showRewardToast(title: string, subtitle: string, xp: number) {
    setCelebrationToast({ title, subtitle, xp });
    setTimeout(() => {
      setCelebrationToast((prev) => (prev?.title === title ? null : prev));
    }, 3800);
  }

  async function handleStartCapture(mode: 'camera' | 'gallery') {
    setAnalysisError(null);
    if (Capacitor.isNativePlatform()) {
      try {
        const img = await capturePhotoFromNativeOrWeb(mode);
        if (img) {
          setCapturedImage(img);
          setAnalysisResult(null);
          setPortionMultiplier(1);
          setScannerOpen(true);
        }
        return;
      } catch (err) {
        console.warn('Native camera fallback to file input:', err);
      }
    }

    if (mode === 'camera') {
      cameraFileInputRef.current?.click();
    } else {
      galleryFileInputRef.current?.click();
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const img = await readFileAsCapturedImage(file);
      setCapturedImage(img);
      setAnalysisResult(null);
      setAnalysisError(null);
      setPortionMultiplier(1);
      setScannerOpen(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to load photo');
    }
  }

  async function handleRunGeminiAnalysis() {
    if (!capturedImage) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const result = await analyzeFoodPhotoWithGemini({
        base64Data: capturedImage.base64Data,
        mimeType: capturedImage.mimeType,
        userNote,
        customInstruction: userState.customPromptInstruction,
      });
      setAnalysisResult(result);
    } catch (err: unknown) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Failed to analyze meal photo.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleToggleDetectedItem(index: number) {
    if (!analysisResult) return;
    const nextItems = analysisResult.items.map((item, idx) =>
      idx === index ? { ...item, included: item.included === false ? true : false } : item
    );
    setAnalysisResult({
      ...analysisResult,
      items: nextItems,
    });
  }

  function handleSaveScannedMeal() {
    if (!analysisResult || !adjustedAnalysis) return;

    const xpBreakdown = calculateMealXp(analysisResult.healthScore);
    const newMeal: MealLog = {
      id: `meal_${Date.now()}`,
      timestamp: new Date().toISOString(),
      dateKey: todayKey,
      mealType,
      mealName: analysisResult.mealName,
      emoji: analysisResult.emoji,
      totalCalories: adjustedAnalysis.totalCalories,
      macros: adjustedAnalysis.macros,
      items: analysisResult.items.filter((i) => i.included !== false),
      healthScore: analysisResult.healthScore,
      wittyFeedback: analysisResult.wittyFeedback,
      confidence: analysisResult.confidence,
      photoDataUrl: capturedImage?.dataUrl,
      xpEarned: xpBreakdown.totalXp,
      portionMultiplier,
      userNote: userNote.trim() || undefined,
    };

    const updatedMeals = [newMeal, ...meals];
    const updatedTodayMeals = [newMeal, ...todayMeals];

    const streakUpdate = updateStreakOnLog(userState, todayKey);

    const tempState: UserState = {
      ...userState,
      streakDays: streakUpdate.streakDays,
      longestStreak: streakUpdate.longestStreak,
      streakFreezes: streakUpdate.streakFreezes,
      lastLoggedDate: todayKey,
    };

    const newBadges: Badge[] = evaluateNewlyUnlockedBadges(
      updatedMeals,
      updatedTodayMeals,
      tempState
    );
    const badgeBonusXp = newBadges.reduce((s, b) => s + b.xpReward, 0);
    const totalXpGained = xpBreakdown.totalXp + badgeBonusXp;

    setMeals(updatedMeals);
    setUserState({
      ...tempState,
      xp: userState.xp + totalXpGained,
      unlockedBadgeIds: [
        ...userState.unlockedBadgeIds,
        ...newBadges.map((b) => b.id),
      ],
    });

    setScannerOpen(false);
    setCapturedImage(null);
    setAnalysisResult(null);
    setUserNote('');

    triggerConfetti();

    if (newBadges.length > 0) {
      showRewardToast(
        `Badge Unlocked: ${newBadges[0].icon} ${newBadges[0].title}`,
        `Logged ${newMeal.mealName} (${newMeal.totalCalories} kcal)`,
        totalXpGained
      );
    } else {
      showRewardToast(
        `${newMeal.emoji} ${newMeal.mealName} Logged`,
        `Health Score ${newMeal.healthScore}/100 • ${streakUpdate.streakDays}d Streak`,
        totalXpGained
      );
    }
  }

  function handleApplyScientificPlan() {
    setUserState((prev) => ({
      ...prev,
      goals: {
        dailyCalories: metabolicPlan.targetDailyCalories,
        proteinGrams: metabolicPlan.recommendedMacros.proteinGrams,
        carbsGrams: metabolicPlan.recommendedMacros.carbsGrams,
        fatGrams: metabolicPlan.recommendedMacros.fatGrams,
        fiberGrams: metabolicPlan.recommendedMacros.fiberGrams,
      },
    }));
    showRewardToast(
      'Scientific Targets Applied',
      `${metabolicPlan.targetDailyCalories} kcal/day • P:${metabolicPlan.recommendedMacros.proteinGrams}g C:${metabolicPlan.recommendedMacros.carbsGrams}g F:${metabolicPlan.recommendedMacros.fatGrams}g`,
      0
    );
  }

  function handleClaimQuest(questId: string, xpReward: number, title: string) {
    if (claimedTodaySet.has(questId)) return;
    const prevClaimed = userState.claimedQuestIdsByDate[todayKey] || [];
    setUserState({
      ...userState,
      xp: userState.xp + xpReward,
      claimedQuestIdsByDate: {
        ...userState.claimedQuestIdsByDate,
        [todayKey]: [...prevClaimed, questId],
      },
    });
    triggerConfetti();
    showRewardToast(`Quest Complete: ${title}`, 'Daily challenge bonus claimed', xpReward);
  }

  function handleDeleteMeal(mealId: string) {
    setMeals((prev) => prev.filter((m) => m.id !== mealId));
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setStoredApiKey(apiKeyInput);
    setSettingsSavedBanner(true);
    setTimeout(() => setSettingsSavedBanner(false), 2500);
  }

  async function handleTestApiKey() {
    setStoredApiKey(apiKeyInput);
    setTestingApi(true);
    setApiTestResult(null);
    try {
      const res = await testGeminiConnection(apiKeyInput);
      setApiTestResult(res);
    } finally {
      setTestingApi(false);
    }
  }

  function handleLoadDemoMealPhoto() {
    // Generate a realistic illustrated sample meal plate on an HTML5 canvas (Grilled Salmon, Rice & Broccoli)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dark table background
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 512, 512);

    // White ceramic plate
    ctx.fillStyle = '#f4f4f5';
    ctx.beginPath();
    ctx.arc(256, 256, 210, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Steamed white rice mound (top left)
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.arc(190, 195, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e4e4e7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Grilled salmon fillet (bottom)
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.roundRect(145, 285, 210, 85, 22);
    ctx.fill();
    // Grill marks on salmon
    ctx.strokeStyle = '#9f1239';
    ctx.lineWidth = 4;
    for (let x = 175; x <= 325; x += 35) {
      ctx.beginPath();
      ctx.moveTo(x, 290);
      ctx.lineTo(x - 15, 365);
      ctx.stroke();
    }

    // Broccoli florets (top right)
    const florets = [
      [320, 175, 34],
      [355, 205, 30],
      [295, 220, 28],
    ];
    for (const [fx, fy, fr] of florets) {
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64Data = dataUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    setCapturedImage({
      base64Data,
      mimeType: 'image/jpeg',
      dataUrl,
    });
    setUserNote('180g grilled salmon fillet, 1 cup steamed white rice, 100g steamed broccoli');
    setAnalysisResult(null);
    setAnalysisError(null);
    setPortionMultiplier(1);
    setScannerOpen(true);
  }

  function handleExportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      userState,
      meals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calquest-backup-${todayKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.userState && Array.isArray(data.meals)) {
          setUserState({ ...DEFAULT_USER_STATE, ...data.userState });
          setMeals(data.meals);
          showRewardToast('Backup Restored', 'All meals, XP, and streaks loaded', 0);
        } else {
          alert('Invalid backup JSON file.');
        }
      } catch {
        alert('Could not parse backup file.');
      }
    };
    reader.readAsText(file);
  }

  const caloriePercent = Math.min(
    100,
    Math.round((todayTotals.calories / Math.max(1, userState.goals.dailyCalories)) * 100)
  );
  const caloriesRemaining = userState.goals.dailyCalories - todayTotals.calories;
  const ringRadius = 56;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (Math.min(100, caloriePercent) / 100) * ringCircumference;

  const hasApiKeyConfigured = Boolean(getStoredApiKey());

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto relative pb-24 border-x border-zinc-900">
      {/* Hidden File Inputs */}
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={importJsonInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportData}
      />

      {/* Toast Notification (fixed z-50 scale, no gradients) */}
      {celebrationToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm bg-zinc-900 text-zinc-100 p-3.5 rounded-2xl shadow-xl border border-emerald-500/40 flex items-center justify-between gap-3 transition-transform duration-200 ease-out"
        >
          <div className="min-w-0">
            <p className="font-bold text-sm text-balance truncate">{celebrationToast.title}</p>
            <p className="text-xs text-zinc-400 text-pretty">{celebrationToast.subtitle}</p>
          </div>
          {celebrationToast.xp > 0 && (
            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-xl font-bold text-xs tabular-nums shrink-0">
              +{celebrationToast.xp} XP
            </span>
          )}
        </div>
      )}

      {/* Top Status Header (z-30) */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Rank & XP */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl shrink-0">
              {levelInfo.rankEmoji}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 tabular-nums">
                  Lv.{levelInfo.level}
                </span>
                <span className="text-xs font-semibold text-zinc-200">
                  {levelInfo.rankTitle}
                </span>
              </div>
              <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 tabular-nums">
                {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP
              </p>
            </div>
          </div>

          {/* Streak & Shields + History Trigger */}
          <div className="flex items-center gap-1.5">
            <div
              title="Streak Freeze Shields"
              className="min-h-9 px-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-1 text-xs font-semibold text-sky-400 tabular-nums"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{userState.streakFreezes}</span>
            </div>
            <div
              title="Active Daily Streak"
              className="min-h-9 px-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-1 text-xs font-bold text-amber-400 tabular-nums"
            >
              <Flame className="w-4 h-4 fill-amber-400/20" />
              <span>{userState.streakDays}d</span>
            </div>
            <button
              type="button"
              aria-label="Open Meal History"
              onClick={() => setShowHistoryDrawer(true)}
              className="min-h-9 min-w-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-300 active:scale-[0.98] transition-transform duration-150"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Missing API Key Banner */}
      {!hasApiKeyConfigured && activeTab !== 'settings' && (
        <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-zinc-900 border border-amber-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-zinc-300">
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-pretty">Add your API key in Settings to enable camera calorie scanning.</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="min-h-9 px-3 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-xs shrink-0 active:scale-[0.98] transition-transform duration-150"
          >
            Setup
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 pt-4 space-y-5">
        {activeTab === 'today' && (
          <>
            {/* Calorie & Macro Card */}
            <section className="bg-zinc-900 border border-zinc-800/90 rounded-3xl p-5 space-y-5">
              <div className="flex items-center justify-between gap-5">
                {/* Ring Gauge */}
                <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 136 136">
                    <circle
                      cx="68"
                      cy="68"
                      r={ringRadius}
                      stroke="currentColor"
                      strokeWidth="10"
                      fill="transparent"
                      className="text-zinc-800"
                    />
                    <circle
                      cx="68"
                      cy="68"
                      r={ringRadius}
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                      fill="transparent"
                      className={cn(
                        'transition-all duration-300 ease-out',
                        caloriesRemaining >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
                      {Math.abs(caloriesRemaining)}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      {caloriesRemaining >= 0 ? 'kcal left' : 'kcal over'}
                    </span>
                    <span className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                      {todayTotals.calories} / {userState.goals.dailyCalories}
                    </span>
                  </div>
                </div>

                {/* Macro Bars */}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-rose-400">Protein</span>
                      <span className="text-zinc-400 tabular-nums">
                        {todayTotals.protein}g / {userState.goals.proteinGrams}g
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(
                            100,
                            (todayTotals.protein / Math.max(1, userState.goals.proteinGrams)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-amber-400">Carbs</span>
                      <span className="text-zinc-400 tabular-nums">
                        {todayTotals.carbs}g / {userState.goals.carbsGrams}g
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(
                            100,
                            (todayTotals.carbs / Math.max(1, userState.goals.carbsGrams)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-sky-400">Fats</span>
                      <span className="text-zinc-400 tabular-nums">
                        {todayTotals.fat}g / {userState.goals.fatGrams}g
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(
                            100,
                            (todayTotals.fat / Math.max(1, userState.goals.fatGrams)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-emerald-400">Fiber</span>
                      <span className="text-zinc-400 tabular-nums">
                        {todayTotals.fiber}g / {userState.goals.fiberGrams || 28}g
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(
                            100,
                            (todayTotals.fiber / Math.max(1, userState.goals.fiberGrams || 28)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Camera Action Row (min-h-11 touch targets, solid fills, no gradients) */}
              <div className="pt-4 border-t border-zinc-800/80 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleStartCapture('camera')}
                  className="flex-1 min-h-11 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-transform duration-150 ease-out"
                >
                  <Camera className="w-5 h-5" />
                  <span>Snap Meal Photo</span>
                </button>
                <button
                  type="button"
                  aria-label="Choose photo from gallery"
                  onClick={() => handleStartCapture('gallery')}
                  className="min-h-11 min-w-11 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-200 font-semibold px-3 rounded-2xl flex items-center justify-center border border-zinc-700 transition-transform duration-150 ease-out"
                >
                  <ImageIcon className="w-5 h-5 text-emerald-400" />
                </button>
                <button
                  type="button"
                  title="Load a sample meal image to test scanning"
                  onClick={handleLoadDemoMealPhoto}
                  className="min-h-11 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-300 text-xs font-bold px-3 rounded-2xl flex items-center justify-center border border-zinc-700 transition-transform duration-150 ease-out"
                >
                  Sample
                </button>
              </div>
            </section>

            {/* Daily Quests Strip */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 text-balance">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Daily Quests
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('quests')}
                  className="text-xs text-emerald-400 font-semibold hover:underline"
                >
                  All Badges
                </button>
              </div>

              <div className="space-y-2">
                {dailyQuests.slice(0, 2).map((q) => {
                  const isClaimed = claimedTodaySet.has(q.id);
                  return (
                    <div
                      key={q.id}
                      className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xl shrink-0">
                          {q.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-100 text-balance">{q.title}</p>
                          <p className="text-xs text-zinc-400 text-pretty">{q.description}</p>
                        </div>
                      </div>
                      {isClaimed ? (
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20 shrink-0">
                          <Check className="w-3.5 h-3.5" /> Done
                        </span>
                      ) : q.completed ? (
                        <button
                          type="button"
                          onClick={() => handleClaimQuest(q.id, q.xpReward, q.title)}
                          className="min-h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tabular-nums shrink-0 active:scale-[0.98] transition-transform duration-150"
                        >
                          Claim +{q.xpReward} XP
                        </button>
                      ) : (
                        <span className="text-xs font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-xl tabular-nums shrink-0">
                          {q.progress}/{q.target}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Today's Logged Meals */}
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 text-balance">
                <Utensils className="w-4 h-4 text-emerald-400" />
                Today&apos;s Meals ({todayMeals.length})
              </h2>

              {todayMeals.length === 0 ? (
                <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-8 text-center space-y-2">
                  <div className="text-3xl">🍱</div>
                  <p className="text-sm font-semibold text-zinc-200 text-balance">
                    No meals logged today
                  </p>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto text-pretty">
                    Take a photo of your plate to log calories, macros, and daily XP.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {todayMeals.map((meal) => {
                    const isExpanded = expandedMealId === meal.id;
                    return (
                      <div
                        key={meal.id}
                        className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {meal.photoDataUrl ? (
                              <img
                                src={meal.photoDataUrl}
                                alt={meal.mealName}
                                className="w-14 h-14 rounded-xl object-cover border border-zinc-800 shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-2xl shrink-0">
                                {meal.emoji}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                                  {meal.mealType}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 tabular-nums">
                                  +{meal.xpEarned} XP
                                </span>
                              </div>
                              <h3 className="font-bold text-sm text-zinc-100 mt-1 truncate text-balance">
                                {meal.emoji} {meal.mealName}
                              </h3>
                              <p className="text-xs text-zinc-400 tabular-nums">
                                P: {meal.macros.proteinGrams}g • C: {meal.macros.carbsGrams}g • F:{' '}
                                {meal.macros.fatGrams}g
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-base font-extrabold text-emerald-400 tabular-nums">
                              {meal.totalCalories}
                            </span>
                            <span className="block text-[10px] text-zinc-500 uppercase">kcal</span>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <button
                                type="button"
                                aria-label="Toggle item breakdown"
                                onClick={() => setExpandedMealId(isExpanded ? null : meal.id)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                              >
                                <ChevronDown
                                  className={cn(
                                    'w-4 h-4 transition-transform duration-150',
                                    isExpanded && 'rotate-180'
                                  )}
                                />
                              </button>
                              <button
                                type="button"
                                aria-label="Delete meal"
                                onClick={() => handleDeleteMeal(meal.id)}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {meal.wittyFeedback && (
                          <p className="text-xs text-zinc-300 bg-zinc-950/70 px-3 py-2 rounded-xl border border-zinc-800/80 text-pretty">
                            {meal.wittyFeedback}
                          </p>
                        )}

                        {isExpanded && meal.items.length > 0 && (
                          <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                            <p className="text-[11px] font-semibold text-zinc-400">
                              Itemized Breakdown
                            </p>
                            {meal.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-zinc-950/50"
                              >
                                <span className="text-zinc-300">
                                  {item.name}{' '}
                                  <span className="text-zinc-500">({item.portionEstimate})</span>
                                </span>
                                <span className="font-semibold text-zinc-200 tabular-nums">
                                  {item.calories} kcal
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* SCIENTIFIC METABOLIC CALCULATOR TAB */}
        {activeTab === 'plan' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800/90 rounded-3xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Dynamic Energy Balance Model
                  </span>
                  <h1 className="text-lg font-extrabold text-zinc-100 mt-0.5 text-balance">
                    Scientific Calorie &amp; Macro Calculator
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1 text-pretty">
                    Combines Mifflin-St Jeor (1990) / Katch-McArdle RMR, Forbes (1987) tissue
                    partitioning, Hall et al. (Lancet, 2011) metabolic adaptation, and Morton et al.
                    (2018) protein synthesis targets.
                  </p>
                </div>
              </div>

              {/* Biometric Inputs Grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800/80">
                <div className="col-span-2 grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  {(['male', 'female'] as const).map((sexVal) => (
                    <button
                      key={sexVal}
                      type="button"
                      onClick={() =>
                        setUserState((s) => ({
                          ...s,
                          biometrics: { ...s.biometrics, sex: sexVal },
                        }))
                      }
                      className={cn(
                        'min-h-10 rounded-lg text-xs font-bold capitalize transition-colors duration-150',
                        userState.biometrics.sex === sexVal
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-400 hover:text-zinc-200'
                      )}
                    >
                      {sexVal}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Age (years)
                  </label>
                  <input
                    type="number"
                    value={userState.biometrics.age}
                    onChange={(e) =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: { ...s.biometrics, age: Number(e.target.value) || 24 },
                      }))
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={userState.biometrics.heightCm}
                    onChange={(e) =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: { ...s.biometrics, heightCm: Number(e.target.value) || 170 },
                      }))
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Current Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={userState.biometrics.weightKg}
                    onChange={(e) =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: { ...s.biometrics, weightKg: Number(e.target.value) || 70 },
                      }))
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Target Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={userState.biometrics.targetWeightKg}
                    onChange={(e) =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: {
                          ...s.biometrics,
                          targetWeightKg: Number(e.target.value) || 70,
                        },
                      }))
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Goal Timeline (weeks)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="104"
                    value={userState.biometrics.targetTimelineWeeks}
                    onChange={(e) =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: {
                          ...s.biometrics,
                          targetTimelineWeeks: Math.max(1, Number(e.target.value) || 12),
                        },
                      }))
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Body Fat % (optional)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={`Est. ${metabolicPlan.estimatedBodyFatPct}%`}
                    value={userState.biometrics.bodyFatPct ?? ''}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setUserState((s) => ({
                        ...s,
                        biometrics: {
                          ...s.biometrics,
                          bodyFatPct: val ? Number(val) : undefined,
                        },
                      }));
                    }}
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Physical Activity Level (PAL)
                  </label>
                  <select
                    value={userState.biometrics.activityLevel}
                    onChange={(e) =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: {
                          ...s.biometrics,
                          activityLevel: e.target.value as UserState['biometrics']['activityLevel'],
                        },
                      }))
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs font-medium text-zinc-100 focus:outline-none focus:border-emerald-500"
                  >
                    {ACTIVITY_MULTIPLIERS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label} (PAL ×{a.pal}) — {a.detail}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2 flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">
                      Resistance / Strength Training
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Preserves lean mass (reduces Forbes partitioning factor p by 50%)
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={userState.biometrics.resistanceTraining}
                    onClick={() =>
                      setUserState((s) => ({
                        ...s,
                        biometrics: {
                          ...s.biometrics,
                          resistanceTraining: !s.biometrics.resistanceTraining,
                        },
                      }))
                    }
                    className={cn(
                      'w-12 h-7 rounded-full p-1 transition-colors duration-150 shrink-0',
                      userState.biometrics.resistanceTraining ? 'bg-emerald-500' : 'bg-zinc-700'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-zinc-950 transition-transform duration-150',
                        userState.biometrics.resistanceTraining && 'translate-x-5'
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Prescribed Output & Mathematical Proof Card */}
            <div className="bg-zinc-900 border border-zinc-800/90 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Prescribed Daily Intake
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-3xl font-extrabold text-zinc-100 tabular-nums">
                      {metabolicPlan.targetDailyCalories}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400 uppercase">kcal / day</span>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      'inline-block text-xs font-bold px-2.5 py-1 rounded-lg tabular-nums',
                      metabolicPlan.dailyCalorieDelta < 0
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : metabolicPlan.dailyCalorieDelta > 0
                        ? 'bg-sky-500/15 text-sky-400'
                        : 'bg-zinc-800 text-zinc-300'
                    )}
                  >
                    {metabolicPlan.dailyCalorieDelta > 0 ? '+' : ''}
                    {metabolicPlan.dailyCalorieDelta} kcal/d
                  </span>
                  <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">
                    Rate: {metabolicPlan.weeklyRateKg > 0 ? '+' : ''}
                    {metabolicPlan.weeklyRateKg} kg/wk
                  </p>
                </div>
              </div>

              {/* Prescribed Macros */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-zinc-950 border border-zinc-800/80 p-2.5 rounded-2xl">
                  <span className="block text-[10px] font-bold uppercase text-rose-400">
                    Protein
                  </span>
                  <span className="text-sm font-extrabold text-zinc-100 tabular-nums">
                    {metabolicPlan.recommendedMacros.proteinGrams}g
                  </span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/80 p-2.5 rounded-2xl">
                  <span className="block text-[10px] font-bold uppercase text-amber-400">
                    Carbs
                  </span>
                  <span className="text-sm font-extrabold text-zinc-100 tabular-nums">
                    {metabolicPlan.recommendedMacros.carbsGrams}g
                  </span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/80 p-2.5 rounded-2xl">
                  <span className="block text-[10px] font-bold uppercase text-sky-400">
                    Fats
                  </span>
                  <span className="text-sm font-extrabold text-zinc-100 tabular-nums">
                    {metabolicPlan.recommendedMacros.fatGrams}g
                  </span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/80 p-2.5 rounded-2xl">
                  <span className="block text-[10px] font-bold uppercase text-emerald-400">
                    Fiber
                  </span>
                  <span className="text-sm font-extrabold text-zinc-100 tabular-nums">
                    {metabolicPlan.recommendedMacros.fiberGrams}g
                  </span>
                </div>
              </div>

              {/* Step-by-Step Mathematical Derivation */}
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
                <p className="font-bold text-zinc-200">
                  Biomathematical Breakdown
                </p>
                <div className="flex justify-between text-zinc-400">
                  <span>1. Mifflin-St Jeor RMR (1990)</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {metabolicPlan.rmrMifflin} kcal/d
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>
                    2. Katch-McArdle RMR (LBM {metabolicPlan.leanMassKg}kg)
                  </span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {metabolicPlan.rmrKatch} kcal/d
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>3. Maintenance TDEE (RMR × {metabolicPlan.pal})</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {metabolicPlan.tdee} kcal/d
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>
                    4. Forbes Partitioning (p = {metabolicPlan.forbesPartitionP})
                  </span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {metabolicPlan.effectiveEnergyDensityKcalPerKg} kcal/kg
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>5. Hall Dynamic Adaptation (Lancet, 2011)</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {metabolicPlan.metabolicAdaptationKcal > 0 ? '+' : ''}
                    {metabolicPlan.metabolicAdaptationKcal} kcal/d
                  </span>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 font-mono leading-relaxed">
                  I = TDEE₀ + [ρ_eff · ΔW] / [t · (1 - β_TEF)] + ½ · ε · ΔW
                </div>
              </div>

              {metabolicPlan.isSafetyClamped && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl text-pretty">
                  Note: Your timeline is aggressive, so daily intake was clamped to a safe clinical
                  floor. Consider extending your target weeks slightly.
                </p>
              )}

              <button
                type="button"
                onClick={handleApplyScientificPlan}
                className="w-full min-h-11 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold py-3 px-4 rounded-2xl transition-transform duration-150 ease-out"
              >
                Apply Prescribed Targets ({metabolicPlan.targetDailyCalories} kcal)
              </button>
            </div>
          </div>
        )}

        {/* QUESTS & BADGES TAB */}
        {activeTab === 'quests' && (
          <div className="space-y-5">
            <div className="bg-zinc-900 border border-zinc-800/90 rounded-3xl p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Active Logging Streak
                </p>
                <h2 className="text-3xl font-extrabold text-zinc-100 mt-0.5 tabular-nums text-balance">
                  {userState.streakDays} {userState.streakDays === 1 ? 'Day' : 'Days'}
                </h2>
                <p className="text-xs text-zinc-400 mt-1 tabular-nums">
                  Longest: <strong className="text-zinc-200">{userState.longestStreak}d</strong> •
                  Streak Freezes: <strong className="text-sky-400">{userState.streakFreezes}</strong>
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-3xl">
                🔥
              </div>
            </div>

            <section className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 text-balance">
                Today&apos;s Quests
              </h3>
              <div className="space-y-2">
                {dailyQuests.map((q) => {
                  const isClaimed = claimedTodaySet.has(q.id);
                  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                  return (
                    <div
                      key={q.id}
                      className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{q.icon}</span>
                          <div>
                            <h4 className="font-bold text-sm text-zinc-100 text-balance">
                              {q.title}
                            </h4>
                            <p className="text-xs text-zinc-400 text-pretty">{q.description}</p>
                          </div>
                        </div>
                        {isClaimed ? (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl">
                            Done
                          </span>
                        ) : q.completed ? (
                          <button
                            type="button"
                            onClick={() => handleClaimQuest(q.id, q.xpReward, q.title)}
                            className="min-h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tabular-nums active:scale-[0.98] transition-transform duration-150"
                          >
                            Claim +{q.xpReward} XP
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-amber-400 tabular-nums">
                            +{q.xpReward} XP
                          </span>
                        )}
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 text-balance">
                <Trophy className="w-4 h-4 text-amber-400" />
                Achievement Badges ({userState.unlockedBadgeIds.length}/{ALL_BADGES.length})
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {ALL_BADGES.map((badge) => {
                  const unlocked = userState.unlockedBadgeIds.includes(badge.id);
                  return (
                    <div
                      key={badge.id}
                      className={cn(
                        'p-3.5 rounded-2xl border transition-opacity',
                        unlocked
                          ? 'bg-zinc-900 border-emerald-500/40'
                          : 'bg-zinc-900/40 border-zinc-800/70 opacity-55'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{badge.icon}</span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums',
                            unlocked
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-400'
                          )}
                        >
                          +{badge.xpReward} XP
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-zinc-100 mt-2 text-balance">
                        {badge.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug text-pretty">
                        {badge.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-4">
            {settingsSavedBanner && (
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Settings saved to your device.
              </div>
            )}

            {/* API Key */}
            <div className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 text-balance">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  API Key
                </h3>
                {hasBuiltInApiKey() && (
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md font-semibold">
                    Configured
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={hasBuiltInApiKey() ? 'Override saved key...' : 'AIzaSy...'}
                  className="flex-1 min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((s) => !s)}
                  className="min-h-11 px-3.5 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={testingApi}
                  onClick={handleTestApiKey}
                  className="min-h-10 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-bold text-emerald-400 border border-zinc-700"
                >
                  {testingApi ? 'Testing Connection...' : 'Test API Connection'}
                </button>
                {apiTestResult && (
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums',
                      apiTestResult.ok ? 'text-emerald-400' : 'text-rose-400'
                    )}
                  >
                    {apiTestResult.ok
                      ? `✓ ${apiTestResult.message} (${apiTestResult.latencyMs}ms)`
                      : `✕ ${apiTestResult.message}`}
                  </span>
                )}
              </div>
            </div>

            {/* Manual Calorie & Macro Override */}
            <div className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-zinc-100 text-balance">
                Daily Calorie &amp; Macro Budget
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Daily Calories (kcal)
                  </label>
                  <input
                    type="number"
                    value={userState.goals.dailyCalories}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        goals: {
                          ...userState.goals,
                          dailyCalories: Number(e.target.value) || 2000,
                        },
                      })
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Protein (g)</label>
                  <input
                    type="number"
                    value={userState.goals.proteinGrams}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        goals: {
                          ...userState.goals,
                          proteinGrams: Number(e.target.value) || 140,
                        },
                      })
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Carbs (g)</label>
                  <input
                    type="number"
                    value={userState.goals.carbsGrams}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        goals: {
                          ...userState.goals,
                          carbsGrams: Number(e.target.value) || 200,
                        },
                      })
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Fat (g)</label>
                  <input
                    type="number"
                    value={userState.goals.fatGrams}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        goals: {
                          ...userState.goals,
                          fatGrams: Number(e.target.value) || 65,
                        },
                      })
                    }
                    className="w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Personal Diet Context */}
            <div className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-zinc-100 text-balance">
                Personal Diet Context
              </h3>
              <p className="text-xs text-zinc-400 text-pretty">
                Persistent cooking &amp; portion notes included automatically when analyzing your
                meal photos.
              </p>
              <textarea
                rows={3}
                value={userState.customPromptInstruction}
                onChange={(e) =>
                  setUserState({
                    ...userState,
                    customPromptInstruction: e.target.value,
                  })
                }
                placeholder="E.g. Home-cooked meals, 1 tsp ghee on rotis, standard bowl is 300ml..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-11 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold text-sm transition-transform duration-150"
            >
              Save Settings
            </button>

            <div className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-zinc-100">Local Data Backup</h3>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleExportData}
                  className="flex-1 min-h-11 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4 text-emerald-400" /> Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => importJsonInputRef.current?.click()}
                  className="flex-1 min-h-11 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-sky-400" /> Import JSON
                </button>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* Meal History Modal (z-40) */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-40 bg-zinc-950 flex flex-col max-w-md mx-auto overflow-y-auto">
          <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-md flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
            <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2 text-balance">
              <History className="w-4 h-4 text-emerald-400" />
              Meal Log History ({meals.length})
            </h2>
            <button
              type="button"
              aria-label="Close history"
              onClick={() => setShowHistoryDrawer(false)}
              className="min-h-10 min-w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2.5">
            {meals.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-12">No meals logged yet.</p>
            ) : (
              meals.map((meal) => (
                <div
                  key={meal.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {meal.photoDataUrl ? (
                      <img
                        src={meal.photoDataUrl}
                        alt={meal.mealName}
                        className="w-12 h-12 rounded-xl object-cover border border-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-zinc-950 flex items-center justify-center text-xl shrink-0">
                        {meal.emoji}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] text-zinc-400 tabular-nums">
                        {meal.dateKey} • {meal.mealType.toUpperCase()}
                      </p>
                      <h4 className="text-sm font-bold text-zinc-100 truncate">
                        {meal.emoji} {meal.mealName}
                      </h4>
                      <p className="text-xs text-zinc-400 tabular-nums">
                        P: {meal.macros.proteinGrams}g • C: {meal.macros.carbsGrams}g • F:{' '}
                        {meal.macros.fatGrams}g
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">
                      {meal.totalCalories} kcal
                    </span>
                    <button
                      type="button"
                      aria-label="Delete meal"
                      onClick={() => handleDeleteMeal(meal.id)}
                      className="block ml-auto text-zinc-500 hover:text-rose-400 mt-1 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Food Scanner Modal (z-50) */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col max-w-md mx-auto overflow-y-auto">
          <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-md flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h2 className="font-bold text-sm text-zinc-100 text-balance">Meal Scanner</h2>
            </div>
            <button
              type="button"
              aria-label="Close scanner"
              onClick={() => setScannerOpen(false)}
              className="min-h-10 min-w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 flex-1">
            {capturedImage && (
              <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 max-h-56 flex items-center justify-center">
                <img
                  src={capturedImage.dataUrl}
                  alt="Captured meal"
                  className="w-full max-h-56 object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleStartCapture('camera')}
                  className="absolute bottom-3 right-3 min-h-9 bg-zinc-950/90 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-100 border border-zinc-700 flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" /> Retake
                </button>
              </div>
            )}

            {/* Meal Type Selector */}
            <div className="grid grid-cols-4 gap-1.5 bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMealType(t)}
                  className={cn(
                    'min-h-10 rounded-xl text-xs font-bold capitalize transition-colors duration-150',
                    mealType === t
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-100'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {!analysisResult && !isAnalyzing && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Optional Meal Note
                  </label>
                  <input
                    type="text"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="e.g., 200g chicken, cooked with 1 tbsp olive oil..."
                    className="w-full min-h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {analysisError && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 text-pretty">
                    {analysisError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleRunGeminiAnalysis}
                  className="w-full min-h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-transform duration-150"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Calculate Calories</span>
                </button>
              </div>
            )}

            {/* Structural Skeleton Loading State (ui-skills baseline-ui rule) */}
            {isAnalyzing && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="h-4 w-28 rounded-md bg-zinc-800 animate-pulse" />
                    <div className="h-6 w-44 rounded-lg bg-zinc-800 animate-pulse" />
                  </div>
                  <div className="h-8 w-16 rounded-lg bg-zinc-800 animate-pulse" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="h-12 rounded-xl bg-zinc-800 animate-pulse" />
                  <div className="h-12 rounded-xl bg-zinc-800 animate-pulse" />
                  <div className="h-12 rounded-xl bg-zinc-800 animate-pulse" />
                  <div className="h-12 rounded-xl bg-zinc-800 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-11 rounded-xl bg-zinc-800 animate-pulse" />
                  <div className="h-11 rounded-xl bg-zinc-800 animate-pulse" />
                </div>
              </div>
            )}

            {/* Analysis Results */}
            {analysisResult && adjustedAnalysis && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 tabular-nums">
                        Health Score: {analysisResult.healthScore}/100
                      </span>
                      <h3 className="text-lg font-extrabold text-zinc-100 mt-1 text-balance">
                        {analysisResult.emoji} {analysisResult.mealName}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-extrabold text-emerald-400 tabular-nums">
                        {adjustedAnalysis.totalCalories}
                      </span>
                      <span className="block text-[10px] uppercase text-zinc-400">kcal</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-center">
                    <div className="bg-zinc-950 p-2 rounded-xl">
                      <span className="block text-[10px] text-rose-400 font-bold">Protein</span>
                      <span className="text-xs font-extrabold text-zinc-100 tabular-nums">
                        {adjustedAnalysis.macros.proteinGrams}g
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-xl">
                      <span className="block text-[10px] text-amber-400 font-bold">Carbs</span>
                      <span className="text-xs font-extrabold text-zinc-100 tabular-nums">
                        {adjustedAnalysis.macros.carbsGrams}g
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-xl">
                      <span className="block text-[10px] text-sky-400 font-bold">Fat</span>
                      <span className="text-xs font-extrabold text-zinc-100 tabular-nums">
                        {adjustedAnalysis.macros.fatGrams}g
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-xl">
                      <span className="block text-[10px] text-emerald-400 font-bold">Fiber</span>
                      <span className="text-xs font-extrabold text-zinc-100 tabular-nums">
                        {adjustedAnalysis.macros.fiberGrams}g
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 text-pretty">
                    {analysisResult.wittyFeedback}
                  </p>
                </div>

                {/* Portion Size Multiplier */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400">Portion Multiplier</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 0.75, 1, 1.25, 1.5].map((mult) => (
                      <button
                        key={mult}
                        type="button"
                        onClick={() => setPortionMultiplier(mult)}
                        className={cn(
                          'min-h-10 rounded-xl text-xs font-bold border tabular-nums transition-colors duration-150',
                          portionMultiplier === mult
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        )}
                      >
                        {mult}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detected Food Items */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400">
                    Detected Items (tap to include / exclude)
                  </label>
                  <div className="space-y-1.5">
                    {analysisResult.items.map((item, idx) => {
                      const included = item.included !== false;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleDetectedItem(idx)}
                          className={cn(
                            'w-full min-h-12 p-3 rounded-xl border text-left flex items-center justify-between transition-colors duration-150',
                            included
                              ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
                              : 'bg-zinc-950 border-zinc-900 text-zinc-600 line-through'
                          )}
                        >
                          <div>
                            <p className="text-xs font-bold">{item.name}</p>
                            <p className="text-[11px] text-zinc-400 tabular-nums">
                              {item.portionEstimate} • P: {item.proteinGrams}g C: {item.carbsGrams}g
                              F: {item.fatGrams}g
                            </p>
                          </div>
                          <span className="text-xs font-extrabold text-emerald-400 tabular-nums">
                            {Math.round(item.calories * portionMultiplier)} kcal
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setAnalysisResult(null)}
                    className="min-h-12 px-4 rounded-2xl bg-zinc-800 text-xs font-bold text-zinc-300"
                  >
                    Re-Scan
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveScannedMeal}
                    className="flex-1 min-h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-transform duration-150"
                  >
                    <span className="tabular-nums">
                      Log Meal (+{calculateMealXp(analysisResult.healthScore).totalXp} XP)
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar (z-30, min-h-11 touch targets) */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/90 px-3 py-1.5 flex items-center justify-around z-30">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={cn(
            'min-h-11 min-w-16 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150',
            activeTab === 'today' ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <Utensils className="w-5 h-5" />
          <span className="text-[10px] font-bold">Today</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('plan')}
          className={cn(
            'min-h-11 min-w-16 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150',
            activeTab === 'plan' ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <Calculator className="w-5 h-5" />
          <span className="text-[10px] font-bold">Body Math</span>
        </button>

        {/* Center Camera Button (solid fill, no gradients/glows per ui-skills) */}
        <button
          type="button"
          aria-label="Snap Meal Photo"
          onClick={() => handleStartCapture('camera')}
          className="-mt-6 w-14 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center shadow-lg border-4 border-zinc-950 active:scale-[0.96] transition-transform duration-150 ease-out"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('quests')}
          className={cn(
            'min-h-11 min-w-16 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150',
            activeTab === 'quests' ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <Award className="w-5 h-5" />
          <span className="text-[10px] font-bold">Quests</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={cn(
            'min-h-11 min-w-16 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150',
            activeTab === 'settings' ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
