import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Award,
  Camera as CameraIcon,
  CheckCircle2,
  ChevronRight,
  Download,
  Flame,
  History,
  Image as ImageIcon,
  KeyRound,
  Plus,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Target,
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
  capturePhotoFromNativeOrWeb,
  readFileAsCapturedImage,
  type CapturedImage,
} from './utils/imageUtils';

const STORAGE_KEY_STATE = 'calquest_user_state_v1';
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
    dailyCalories: 2100,
    proteinGrams: 140,
    carbsGrams: 210,
    fatGrams: 70,
  },
  customPromptInstruction: '',
};

export function App() {
  const [activeTab, setActiveTab] = useState<'today' | 'quests' | 'history' | 'settings'>('today');

  const [userState, setUserState] = useState<UserState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STATE);
      if (saved) {
        return { ...DEFAULT_USER_STATE, ...JSON.parse(saved) };
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

  // Persist state & meals
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

  // Celebration toast state
  const [celebrationToast, setCelebrationToast] = useState<{
    title: string;
    subtitle: string;
    xp: number;
  } | null>(null);

  // Settings form state
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsSavedBanner, setSettingsSavedBanner] = useState(false);

  // Hidden file inputs for web/fallback camera & gallery
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

  // Adjusted analysis metrics based on toggled items & portion multiplier
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
        particleCount: 65,
        spread: 70,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore if canvas-confetti fails
    }
  }

  function showRewardToast(title: string, subtitle: string, xp: number) {
    setCelebrationToast({ title, subtitle, xp });
    setTimeout(() => {
      setCelebrationToast((prev) => (prev?.title === title ? null : prev));
    }, 4200);
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
        err instanceof Error ? err.message : 'Failed to analyze image with Gemini 4 Argon.'
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

    // Update streak
    const streakUpdate = updateStreakOnLog(userState, todayKey);

    const tempState: UserState = {
      ...userState,
      streakDays: streakUpdate.streakDays,
      longestStreak: streakUpdate.longestStreak,
      streakFreezes: streakUpdate.streakFreezes,
      lastLoggedDate: todayKey,
    };

    // Check newly unlocked badges
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
        `Badge Unlocked: ${newBadges[0].icon} ${newBadges[0].title}!`,
        `Logged ${newMeal.mealName} (${newMeal.totalCalories} kcal)`,
        totalXpGained
      );
    } else {
      showRewardToast(
        `${newMeal.emoji} ${newMeal.mealName} Logged!`,
        `Health Score ${newMeal.healthScore}/100 • Streak: ${streakUpdate.streakDays}d 🔥`,
        totalXpGained
      );
    }
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
    showRewardToast(`Quest Complete: ${title}!`, 'Daily challenge bonus claimed', xpReward);
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
          alert('Backup restored successfully!');
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
  const ringRadius = 58;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (Math.min(100, caloriePercent) / 100) * ringCircumference;

  const hasApiKeyConfigured = Boolean(getStoredApiKey());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto relative pb-24 shadow-2xl border-x border-slate-900">
      {/* Hidden File Inputs for Web & Fallback Camera */}
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

      {/* Celebration Toast */}
      {celebrationToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center justify-between animate-bounce-short">
          <div className="pr-2">
            <p className="font-bold text-sm">{celebrationToast.title}</p>
            <p className="text-xs text-emerald-100">{celebrationToast.subtitle}</p>
          </div>
          <div className="bg-slate-950/30 px-3 py-1.5 rounded-xl font-extrabold text-xs whitespace-nowrap border border-white/20">
            +{celebrationToast.xp} XP
          </div>
        </div>
      )}

      {/* Top Gamification Header */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Brand & Rank */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-xl shadow-inner">
              {levelInfo.rankEmoji}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                  Lv.{levelInfo.level}
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  {levelInfo.rankTitle}
                </span>
              </div>
              {/* XP Bar */}
              <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-500"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP
              </p>
            </div>
          </div>

          {/* Streak & Freeze Shields */}
          <div className="flex items-center gap-2">
            <div
              title="Streak Freeze Shields (protects your streak if you miss 1 day)"
              className="flex items-center gap-1 bg-sky-950/60 border border-sky-500/30 px-2.5 py-1.5 rounded-xl text-xs font-bold text-sky-300"
            >
              <Shield className="w-3.5 h-3.5 text-sky-400 fill-sky-400/20" />
              <span>{userState.streakFreezes}</span>
            </div>
            <div className="flex items-center gap-1 bg-amber-950/60 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-extrabold text-amber-300">
              <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
              <span>{userState.streakDays}d</span>
            </div>
          </div>
        </div>
      </header>

      {/* Missing API Key Banner */}
      {!hasApiKeyConfigured && activeTab !== 'settings' && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Add your Gemini API key in Settings to scan food photos.</span>
          </div>
          <button
            onClick={() => setActiveTab('settings')}
            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shrink-0"
          >
            Setup
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 px-4 pt-4 space-y-5">
        {activeTab === 'today' && (
          <>
            {/* Hero Calorie & Macro Card */}
            <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between gap-4">
                {/* Circular Progress Ring */}
                <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                    <circle
                      cx="70"
                      cy="70"
                      r={ringRadius}
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="transparent"
                      className="text-slate-800"
                    />
                    <circle
                      cx="70"
                      cy="70"
                      r={ringRadius}
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                      fill="transparent"
                      className={
                        caloriesRemaining >= 0
                          ? 'text-emerald-400 transition-all duration-700'
                          : 'text-rose-400 transition-all duration-700'
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-black tracking-tight text-white">
                      {Math.abs(caloriesRemaining)}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {caloriesRemaining >= 0 ? 'kcal left' : 'kcal over'}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      {todayTotals.calories} / {userState.goals.dailyCalories}
                    </span>
                  </div>
                </div>

                {/* Macro Bars */}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-rose-300">Protein</span>
                      <span className="text-slate-400 font-mono">
                        {todayTotals.protein}g / {userState.goals.proteinGrams}g
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-400 rounded-full transition-all"
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
                      <span className="font-semibold text-amber-300">Carbs</span>
                      <span className="text-slate-400 font-mono">
                        {todayTotals.carbs}g / {userState.goals.carbsGrams}g
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
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
                      <span className="font-semibold text-sky-300">Fats</span>
                      <span className="text-slate-400 font-mono">
                        {todayTotals.fat}g / {userState.goals.fatGrams}g
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-400 rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (todayTotals.fat / Math.max(1, userState.goals.fatGrams)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Camera CTA Bar */}
              <div className="mt-5 pt-4 border-t border-slate-800/80 flex gap-2.5">
                <button
                  onClick={() => handleStartCapture('camera')}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.99] text-slate-950 font-extrabold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
                >
                  <CameraIcon className="w-5 h-5" />
                  <span>Snap Food Photo</span>
                </button>
                <button
                  onClick={() => handleStartCapture('gallery')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-1.5 border border-slate-700 transition"
                  title="Pick food photo from gallery"
                >
                  <ImageIcon className="w-5 h-5 text-emerald-400" />
                </button>
              </div>
            </section>

            {/* Active Daily Quests Strip */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Daily Quests
                </h2>
                <button
                  onClick={() => setActiveTab('quests')}
                  className="text-xs text-emerald-400 font-semibold flex items-center hover:underline"
                >
                  All Badges <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {dailyQuests.slice(0, 2).map((q) => {
                  const isClaimed = claimedTodaySet.has(q.id);
                  return (
                    <div
                      key={q.id}
                      className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{q.icon}</div>
                        <div>
                          <p className="text-xs font-bold text-slate-100">{q.title}</p>
                          <p className="text-[11px] text-slate-400">{q.description}</p>
                        </div>
                      </div>
                      {isClaimed ? (
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 px-2.5 py-1 bg-emerald-950/60 rounded-xl border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Claimed
                        </span>
                      ) : q.completed ? (
                        <button
                          onClick={() => handleClaimQuest(q.id, q.xpReward, q.title)}
                          className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow animate-pulse"
                        >
                          Claim +{q.xpReward} XP
                        </button>
                      ) : (
                        <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-xl">
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
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Utensils className="w-4 h-4 text-emerald-400" />
                  Today&apos;s Meals ({todayMeals.length})
                </h2>
              </div>

              {todayMeals.length === 0 ? (
                <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 text-center space-y-2">
                  <div className="text-4xl">🍱</div>
                  <p className="text-sm font-semibold text-slate-300">No meals logged today yet</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Snap a photo of your plate and let Gemini 4 Argon calculate the calories &amp;
                    macros automatically!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 shadow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {meal.photoDataUrl ? (
                            <img
                              src={meal.photoDataUrl}
                              alt={meal.mealName}
                              className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center text-2xl shrink-0">
                              {meal.emoji}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                {meal.mealType}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                                +{meal.xpEarned} XP
                              </span>
                            </div>
                            <h3 className="font-bold text-sm text-white mt-1">
                              {meal.emoji} {meal.mealName}
                            </h3>
                            <p className="text-xs text-slate-400">
                              P: {meal.macros.proteinGrams}g • C: {meal.macros.carbsGrams}g • F:{' '}
                              {meal.macros.fatGrams}g
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-base font-black text-emerald-400">
                            {meal.totalCalories}
                          </span>
                          <span className="block text-[10px] text-slate-400 uppercase">kcal</span>
                          <button
                            onClick={() => handleDeleteMeal(meal.id)}
                            className="text-slate-600 hover:text-rose-400 mt-1 p-1"
                            title="Delete meal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {meal.wittyFeedback && (
                        <p className="text-xs text-slate-300 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800/80 italic">
                          &ldquo;{meal.wittyFeedback}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'quests' && (
          <div className="space-y-6">
            {/* Streak Banner */}
            <div className="bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-slate-900 border border-orange-500/30 rounded-3xl p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-300">
                  Active Logging Streak
                </p>
                <h2 className="text-3xl font-black text-white mt-0.5">
                  {userState.streakDays} {userState.streakDays === 1 ? 'Day' : 'Days'} 🔥
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Longest Streak: <strong className="text-white">{userState.longestStreak}d</strong>{' '}
                  • Streak Freezes: <strong className="text-sky-300">{userState.streakFreezes}❄️</strong>
                </p>
              </div>
              <div className="text-5xl">🔥</div>
            </div>

            {/* All Daily Quests */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" />
                Today&apos;s Quests
              </h3>
              <div className="space-y-2.5">
                {dailyQuests.map((q) => {
                  const isClaimed = claimedTodaySet.has(q.id);
                  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                  return (
                    <div
                      key={q.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{q.icon}</span>
                          <div>
                            <h4 className="font-bold text-sm text-white">{q.title}</h4>
                            <p className="text-xs text-slate-400">{q.description}</p>
                          </div>
                        </div>
                        {isClaimed ? (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-xl">
                            Done ✓
                          </span>
                        ) : q.completed ? (
                          <button
                            onClick={() => handleClaimQuest(q.id, q.xpReward, q.title)}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow"
                          >
                            Claim +{q.xpReward} XP
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-amber-300">
                            +{q.xpReward} XP
                          </span>
                        )}
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Achievement Badges Grid */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Achievement Badges ({userState.unlockedBadgeIds.length}/{ALL_BADGES.length})
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {ALL_BADGES.map((badge) => {
                  const unlocked = userState.unlockedBadgeIds.includes(badge.id);
                  return (
                    <div
                      key={badge.id}
                      className={`p-3.5 rounded-2xl border transition ${
                        unlocked
                          ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-500/40 shadow-md'
                          : 'bg-slate-900/40 border-slate-800/80 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{badge.icon}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            unlocked
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          +{badge.xpReward} XP
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-white mt-2">{badge.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {badge.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-400" />
              Meal Log History ({meals.length} total)
            </h2>

            {meals.length === 0 ? (
              <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 text-center space-y-2">
                <p className="text-sm text-slate-400">Your logged meals will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {meals.map((meal) => (
                  <div
                    key={meal.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {meal.photoDataUrl ? (
                        <img
                          src={meal.photoDataUrl}
                          alt={meal.mealName}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl">
                          {meal.emoji}
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {meal.dateKey} • {meal.mealType.toUpperCase()}
                        </p>
                        <h4 className="text-sm font-bold text-white">
                          {meal.emoji} {meal.mealName}
                        </h4>
                        <p className="text-xs text-slate-400">
                          Health Score: {meal.healthScore}/100 • P: {meal.macros.proteinGrams}g
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-400">
                        {meal.totalCalories} kcal
                      </span>
                      <button
                        onClick={() => handleDeleteMeal(meal.id)}
                        className="block ml-auto text-slate-600 hover:text-rose-400 mt-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-5">
            {settingsSavedBanner && (
              <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Settings saved to your device!
              </div>
            )}

            {/* Gemini 4 Argon API Key Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  Gemini 4 Argon API Key
                </h3>
                {hasBuiltInApiKey() && (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                    GitHub Secret Key Baked In
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Used directly on your phone to call <code className="text-emerald-300">gemini-4-argon</code> via the official <code className="text-emerald-300">@google/genai</code> SDK.
              </p>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    hasBuiltInApiKey()
                      ? 'Using baked-in key (paste here to override)'
                      : 'AIzaSy...'
                  }
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((s) => !s)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Daily Calorie & Macro Targets */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                Daily Calorie &amp; Macro Goals
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Protein (g)</label>
                  <input
                    type="number"
                    value={userState.goals.proteinGrams}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        goals: {
                          ...userState.goals,
                          proteinGrams: Number(e.target.value) || 120,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Carbs (g)</label>
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Fat (g)</label>
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Custom Prompt Instructions for Gemini 4 Argon */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Personal Diet Context for Gemini 4 Argon
              </h3>
              <p className="text-xs text-slate-400">
                Optional hint sent with every photo (e.g., &ldquo;Home-cooked Indian meals, 1 tsp
                ghee on rotis, my bowl holds 300ml&rdquo;).
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
                placeholder="E.g. I usually cook with olive oil spray and eat high-protein portions..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm shadow-lg"
            >
              Save Settings
            </button>

            {/* Backup & Restore */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Local Data Backup</h3>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleExportData}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4 text-emerald-400" /> Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => importJsonInputRef.current?.click()}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-sky-400" /> Import JSON
                </button>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* AI Food Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col max-w-md mx-auto overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="font-extrabold text-sm text-white">
                Gemini 4 Argon Food Scanner
              </h2>
            </div>
            <button
              onClick={() => setScannerOpen(false)}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 flex-1">
            {/* Photo Preview */}
            {capturedImage && (
              <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 max-h-56 flex items-center justify-center">
                <img
                  src={capturedImage.dataUrl}
                  alt="Captured meal"
                  className="w-full max-h-56 object-cover"
                />
                <button
                  onClick={() => handleStartCapture('camera')}
                  className="absolute bottom-2.5 right-2.5 bg-slate-950/80 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-bold text-white border border-white/15 flex items-center gap-1.5"
                >
                  <CameraIcon className="w-3.5 h-3.5 text-emerald-400" /> Retake
                </button>
              </div>
            )}

            {/* Meal Type & Optional Hint */}
            <div className="grid grid-cols-4 gap-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMealType(t)}
                  className={`py-2 rounded-xl text-xs font-bold capitalize transition ${
                    mealType === t
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {!analysisResult && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Optional Note for Gemini 4 Argon
                  </label>
                  <input
                    type="text"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="e.g., 200g chicken breast, cooked with 1 tbsp butter..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {analysisError && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                    {analysisError}
                  </div>
                )}

                <button
                  onClick={handleRunGeminiAnalysis}
                  disabled={isAnalyzing}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-50 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Analyzing with Gemini 4 Argon...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Calculate Calories with Gemini 4 Argon</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Analysis Results & Interactive Portion/Item Toggles */}
            {analysisResult && adjustedAnalysis && (
              <div className="space-y-4 animate-fadeIn">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                        Health Score: {analysisResult.healthScore}/100
                      </span>
                      <h3 className="text-lg font-black text-white mt-1">
                        {analysisResult.emoji} {analysisResult.mealName}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-emerald-400">
                        {adjustedAnalysis.totalCalories}
                      </span>
                      <span className="block text-[10px] uppercase text-slate-400">kcal</span>
                    </div>
                  </div>

                  {/* Macro Pills */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-center">
                    <div className="bg-slate-950/80 p-2 rounded-xl">
                      <span className="block text-[10px] text-rose-300 font-bold">Protein</span>
                      <span className="text-xs font-extrabold text-white">
                        {adjustedAnalysis.macros.proteinGrams}g
                      </span>
                    </div>
                    <div className="bg-slate-950/80 p-2 rounded-xl">
                      <span className="block text-[10px] text-amber-300 font-bold">Carbs</span>
                      <span className="text-xs font-extrabold text-white">
                        {adjustedAnalysis.macros.carbsGrams}g
                      </span>
                    </div>
                    <div className="bg-slate-950/80 p-2 rounded-xl">
                      <span className="block text-[10px] text-sky-300 font-bold">Fat</span>
                      <span className="text-xs font-extrabold text-white">
                        {adjustedAnalysis.macros.fatGrams}g
                      </span>
                    </div>
                    <div className="bg-slate-950/80 p-2 rounded-xl">
                      <span className="block text-[10px] text-emerald-300 font-bold">Fiber</span>
                      <span className="text-xs font-extrabold text-white">
                        {adjustedAnalysis.macros.fiberGrams}g
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 italic">
                    🤖 &ldquo;{analysisResult.wittyFeedback}&rdquo;
                  </p>
                </div>

                {/* Portion Size Multiplier */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">
                    Portion Multiplier
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 0.75, 1, 1.25, 1.5].map((mult) => (
                      <button
                        key={mult}
                        type="button"
                        onClick={() => setPortionMultiplier(mult)}
                        className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                          portionMultiplier === mult
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {mult}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detected Food Items Breakdown */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">
                    Detected Items (tap to toggle)
                  </label>
                  <div className="space-y-1.5">
                    {analysisResult.items.map((item, idx) => {
                      const included = item.included !== false;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleDetectedItem(idx)}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                            included
                              ? 'bg-slate-900 border-slate-800 text-white'
                              : 'bg-slate-950 border-slate-900 text-slate-600 line-through'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold">{item.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {item.portionEstimate} • P: {item.proteinGrams}g C: {item.carbsGrams}g
                              F: {item.fatGrams}g
                            </p>
                          </div>
                          <span className="text-xs font-extrabold text-emerald-400">
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
                    className="px-4 py-3.5 rounded-2xl bg-slate-800 text-xs font-bold text-slate-300"
                  >
                    Re-Analyze
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveScannedMeal}
                    className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-sm shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>
                      Log Meal (+{calculateMealXp(analysisResult.healthScore).totalXp} XP)
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 px-4 py-2 flex items-center justify-around z-30">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'today' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Utensils className="w-5 h-5" />
          <span className="text-[10px] font-bold">Today</span>
        </button>

        <button
          onClick={() => setActiveTab('quests')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'quests' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-5 h-5" />
          <span className="text-[10px] font-bold">Quests</span>
        </button>

        {/* Floating Center Camera Action Button */}
        <button
          onClick={() => handleStartCapture('camera')}
          className="-mt-7 w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center shadow-xl shadow-emerald-500/30 border-4 border-slate-950 active:scale-95 transition"
          title="Snap Meal Photo"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'history' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] font-bold">History</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'settings' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
      </nav>
    </div>
  );
}
export default App;
