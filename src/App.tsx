import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogContent,
  Divider,
  Fab,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Slider,
  Slide,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import {
  AcUnitRounded,
  AddAPhotoRounded,
  AutoAwesomeRounded,
  BoltRounded,
  CheckCircleRounded,
  CloseRounded,
  DeleteOutlineRounded,
  EmojiEventsRounded,
  ExpandMoreRounded,
  FileDownloadRounded,
  FileUploadRounded,
  FitnessCenterRounded,
  GrassRounded,
  HistoryRounded,
  KeyRounded,
  LocalFireDepartmentRounded,
  MemoryRounded,
  OpacityRounded,
  PhotoCameraRounded,
  PhotoLibraryRounded,
  RestaurantMenuRounded,
  SettingsRounded,
  TrackChangesRounded,
  VisibilityOffRounded,
  VisibilityRounded,
} from '@mui/icons-material';
import { Capacitor } from '@capacitor/core';
import type {
  Badge,
  GeminiMealAnalysis,
  GeminiModelId,
  MealLog,
  UserState,
} from './types';
import {
  AVAILABLE_GEMINI_MODELS,
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
  selectedModel: 'gemini-3.8-flash',
};

const SlideUpTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export function App() {
  const [activeTab, setActiveTab] = useState<'today' | 'quests' | 'history' | 'settings'>('today');
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);

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

  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);

  const todayKey = getLocalDateKey();
  const activeModelMeta =
    AVAILABLE_GEMINI_MODELS.find((m) => m.id === userState.selectedModel) ||
    AVAILABLE_GEMINI_MODELS[0];

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
        particleCount: 70,
        spread: 75,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore
    }
  }

  function showRewardToast(title: string, subtitle: string, xp: number) {
    setCelebrationToast({ title, subtitle, xp });
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
        model: userState.selectedModel,
        userNote,
        customInstruction: userState.customPromptInstruction,
      });
      setAnalysisResult(result);
    } catch (err: unknown) {
      setAnalysisError(
        err instanceof Error ? err.message : `Failed to analyze image with ${activeModelMeta.name}.`
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
      modelUsed: userState.selectedModel,
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
          showRewardToast('Backup Restored!', 'All meals, XP, and streaks loaded', 0);
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
  const hasApiKeyConfigured = Boolean(getStoredApiKey());

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        pb: 12,
        maxWidth: 480,
        mx: 'auto',
        position: 'relative',
        boxShadow: '0 0 60px rgba(0,0,0,0.8)',
      }}
    >
      {/* Hidden File Inputs */}
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileSelected}
      />
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileSelected}
      />
      <input
        ref={importJsonInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={handleImportData}
      />

      {/* Celebratory Material Snackbar */}
      <Snackbar
        open={Boolean(celebrationToast)}
        autoHideDuration={4000}
        onClose={() => setCelebrationToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Paper
          elevation={8}
          sx={{
            px: 2.5,
            py: 1.5,
            borderRadius: 4,
            background: 'linear-gradient(135deg, #059669 0%, #0D9488 100%)',
            border: '1px solid rgba(52, 211, 153, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            color: '#fff',
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {celebrationToast?.title}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
              {celebrationToast?.subtitle}
            </Typography>
          </Box>
          {celebrationToast && celebrationToast.xp > 0 && (
            <Chip
              label={`+${celebrationToast.xp} XP`}
              size="small"
              sx={{
                bgcolor: 'rgba(0,0,0,0.35)',
                color: '#A7F3D0',
                fontWeight: 800,
              }}
            />
          )}
        </Paper>
      </Snackbar>

      {/* Material AppBar Header */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: alpha('#0B0F19', 0.85),
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: 2, py: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              sx={{
                width: 44,
                height: 44,
                borderRadius: 3.5,
                bgcolor: alpha('#10B981', 0.15),
                border: '1px solid',
                borderColor: alpha('#10B981', 0.35),
                fontSize: '1.35rem',
              }}
            >
              {levelInfo.rankEmoji}
            </Avatar>
            <Box sx={{ minWidth: 135 }}>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <Chip
                  label={`Lv.${levelInfo.level}`}
                  size="small"
                  color="primary"
                  sx={{ height: 20, fontSize: '0.68rem', fontWeight: 800 }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {levelInfo.rankTitle}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={levelInfo.progressPercent}
                sx={{ mt: 0.7, height: 6 }}
              />
              <Typography
                variant="caption"
                sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mt: 0.3 }}
              >
                {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Streak Freeze Shields (protects your streak if you miss a day)">
              <Chip
                icon={<AcUnitRounded sx={{ fontSize: '1rem !important', color: '#38BDF8 !important' }} />}
                label={userState.streakFreezes}
                size="small"
                sx={{
                  bgcolor: alpha('#38BDF8', 0.12),
                  color: '#BAE6FD',
                  border: '1px solid',
                  borderColor: alpha('#38BDF8', 0.3),
                }}
              />
            </Tooltip>
            <Chip
              icon={
                <LocalFireDepartmentRounded
                  sx={{ fontSize: '1.1rem !important', color: '#FB923C !important' }}
                />
              }
              label={`${userState.streakDays}d`}
              size="small"
              sx={{
                bgcolor: alpha('#F59E0B', 0.15),
                color: '#FDE68A',
                border: '1px solid',
                borderColor: alpha('#F59E0B', 0.35),
                fontWeight: 800,
              }}
            />
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Missing API Key Alert */}
      {!hasApiKeyConfigured && activeTab !== 'settings' && (
        <Box sx={{ px: 2, pt: 2 }}>
          <Alert
            severity="warning"
            variant="outlined"
            icon={<KeyRounded />}
            action={
              <Button
                color="warning"
                size="small"
                variant="contained"
                onClick={() => setActiveTab('settings')}
              >
                Setup
              </Button>
            }
            sx={{ borderRadius: 3 }}
          >
            Add your free Google AI Studio key in Settings to scan food photos.
          </Alert>
        </Box>
      )}

      {/* Main Content Container */}
      <Container maxWidth="sm" sx={{ px: 2, pt: 2.5 }}>
        {activeTab === 'today' && (
          <Stack spacing={3}>
            {/* Hero Calorie & Macro Material Card */}
            <Card elevation={0}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" spacing={2.5} alignItems="center">
                  {/* Dual Layered CircularProgress Ring */}
                  <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      size={136}
                      thickness={4.5}
                      sx={{ color: 'rgba(148, 163, 184, 0.14)' }}
                    />
                    <CircularProgress
                      variant="determinate"
                      value={caloriePercent}
                      size={136}
                      thickness={4.5}
                      color={caloriesRemaining >= 0 ? 'primary' : 'error'}
                      sx={{
                        position: 'absolute',
                        left: 0,
                        '& .MuiCircularProgress-circle': {
                          strokeLinecap: 'round',
                        },
                      }}
                    />
                    <Box
                      sx={{
                        top: 0,
                        left: 0,
                        bottom: 0,
                        right: 0,
                        position: 'absolute',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
                        {Math.abs(caloriesRemaining)}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          color: 'text.secondary',
                          fontSize: '0.65rem',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {caloriesRemaining >= 0 ? 'kcal left' : 'kcal over'}
                      </Typography>
                      <Chip
                        label={`${todayTotals.calories} / ${userState.goals.dailyCalories}`}
                        size="small"
                        sx={{
                          mt: 0.6,
                          height: 18,
                          fontSize: '0.62rem',
                          bgcolor: 'rgba(15, 23, 42, 0.7)',
                        }}
                      />
                    </Box>
                  </Box>

                  {/* Macro Breakdown Bars */}
                  <Stack spacing={1.5} sx={{ flex: 1 }}>
                    <Box>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <FitnessCenterRounded sx={{ fontSize: 14, color: '#FB7185' }} />
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#FDA4AF' }}>
                            Protein
                          </Typography>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          {todayTotals.protein}g / {userState.goals.proteinGrams}g
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        color="error"
                        value={Math.min(
                          100,
                          (todayTotals.protein / Math.max(1, userState.goals.proteinGrams)) * 100
                        )}
                      />
                    </Box>

                    <Box>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <BoltRounded sx={{ fontSize: 15, color: '#FBBF24' }} />
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#FDE68A' }}>
                            Carbs
                          </Typography>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          {todayTotals.carbs}g / {userState.goals.carbsGrams}g
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        color="secondary"
                        value={Math.min(
                          100,
                          (todayTotals.carbs / Math.max(1, userState.goals.carbsGrams)) * 100
                        )}
                      />
                    </Box>

                    <Box>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <OpacityRounded sx={{ fontSize: 14, color: '#38BDF8' }} />
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#BAE6FD' }}>
                            Fats
                          </Typography>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          {todayTotals.fat}g / {userState.goals.fatGrams}g
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        color="info"
                        value={Math.min(
                          100,
                          (todayTotals.fat / Math.max(1, userState.goals.fatGrams)) * 100
                        )}
                      />
                    </Box>
                  </Stack>
                </Stack>

                <Divider sx={{ my: 2.2 }} />

                {/* Material Camera Action Buttons */}
                <Stack direction="row" spacing={1.5}>
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<PhotoCameraRounded />}
                    onClick={() => handleStartCapture('camera')}
                  >
                    Snap Food Photo
                  </Button>
                  <Tooltip title="Upload food photo from gallery">
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleStartCapture('gallery')}
                      sx={{ minWidth: 52, px: 1.5 }}
                    >
                      <PhotoLibraryRounded />
                    </Button>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>

            {/* Daily Quests Section */}
            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1.2 }}
              >
                <Stack direction="row" spacing={0.8} alignItems="center">
                  <BoltRounded color="secondary" fontSize="small" />
                  <Typography
                    variant="overline"
                    sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
                  >
                    Daily Quests
                  </Typography>
                </Stack>
                <Button
                  size="small"
                  color="primary"
                  onClick={() => setActiveTab('quests')}
                  sx={{ py: 0.2 }}
                >
                  View All ({dailyQuests.length})
                </Button>
              </Stack>

              <Stack spacing={1.2}>
                {dailyQuests.slice(0, 2).map((q) => {
                  const isClaimed = claimedTodaySet.has(q.id);
                  return (
                    <Card key={q.id} elevation={0}>
                      <CardContent
                        sx={{
                          p: 1.8,
                          '&:last-child': { pb: 1.8 },
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1.5,
                        }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            sx={{
                              bgcolor: 'rgba(15, 23, 42, 0.7)',
                              width: 42,
                              height: 42,
                              fontSize: '1.3rem',
                            }}
                          >
                            {q.icon}
                          </Avatar>
                          <Box>
                            <Typography variant="subtitle2">{q.title}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {q.description}
                            </Typography>
                          </Box>
                        </Stack>

                        {isClaimed ? (
                          <Chip
                            icon={<CheckCircleRounded />}
                            label="Claimed"
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        ) : q.completed ? (
                          <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            onClick={() => handleClaimQuest(q.id, q.xpReward, q.title)}
                          >
                            +{q.xpReward} XP
                          </Button>
                        ) : (
                          <Chip
                            label={`${q.progress}/${q.target}`}
                            size="small"
                            sx={{ bgcolor: 'rgba(15, 23, 42, 0.75)' }}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Box>

            {/* Today's Meals Timeline */}
            <Box>
              <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1.2 }}>
                <RestaurantMenuRounded color="primary" fontSize="small" />
                <Typography
                  variant="overline"
                  sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
                >
                  Today&apos;s Meals ({todayMeals.length})
                </Typography>
              </Stack>

              {todayMeals.length === 0 ? (
                <Card
                  elevation={0}
                  sx={{
                    borderStyle: 'dashed',
                    textAlign: 'center',
                    py: 4,
                    px: 2,
                  }}
                >
                  <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>🍱</Typography>
                  <Typography variant="subtitle1">No meals logged today yet</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 280, mx: 'auto', mt: 0.5 }}>
                    Tap the camera button below to snap a photo and calculate your calories &amp; macros!
                  </Typography>
                </Card>
              ) : (
                <Stack spacing={1.5}>
                  {todayMeals.map((meal) => {
                    const isExpanded = expandedMealId === meal.id;
                    return (
                      <Card key={meal.id} elevation={0}>
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="flex-start"
                            spacing={1.5}
                          >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar
                                src={meal.photoDataUrl}
                                variant="rounded"
                                sx={{
                                  width: 58,
                                  height: 58,
                                  borderRadius: 3,
                                  bgcolor: 'rgba(15, 23, 42, 0.8)',
                                  fontSize: '1.6rem',
                                }}
                              >
                                {meal.emoji}
                              </Avatar>
                              <Box>
                                <Stack direction="row" spacing={0.8} alignItems="center">
                                  <Chip
                                    label={meal.mealType.toUpperCase()}
                                    size="small"
                                    sx={{
                                      height: 20,
                                      fontSize: '0.62rem',
                                      bgcolor: 'rgba(148, 163, 184, 0.14)',
                                    }}
                                  />
                                  <Chip
                                    label={`+${meal.xpEarned} XP`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ height: 20, fontSize: '0.62rem' }}
                                  />
                                </Stack>
                                <Typography variant="subtitle1" sx={{ mt: 0.5, lineHeight: 1.25 }}>
                                  {meal.emoji} {meal.mealName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  P: {meal.macros.proteinGrams}g • C: {meal.macros.carbsGrams}g • F:{' '}
                                  {meal.macros.fatGrams}g • Score: {meal.healthScore}/100
                                </Typography>
                              </Box>
                            </Stack>

                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="h6" color="primary.light" sx={{ lineHeight: 1.1 }}>
                                {meal.totalCalories}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', fontSize: '0.65rem' }}
                              >
                                KCAL
                              </Typography>
                              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.5 }}>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setExpandedMealId(isExpanded ? null : meal.id)
                                  }
                                >
                                  <ExpandMoreRounded
                                    fontSize="small"
                                    sx={{
                                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                      transition: '0.2s',
                                    }}
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteMeal(meal.id)}
                                >
                                  <DeleteOutlineRounded fontSize="small" />
                                </IconButton>
                              </Stack>
                            </Box>
                          </Stack>

                          {meal.wittyFeedback && (
                            <Paper
                              variant="outlined"
                              sx={{
                                mt: 1.5,
                                px: 1.5,
                                py: 1,
                                borderRadius: 2.5,
                                bgcolor: 'rgba(11, 15, 25, 0.55)',
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                              >
                                🤖 &ldquo;{meal.wittyFeedback}&rdquo;
                              </Typography>
                            </Paper>
                          )}

                          <Collapse in={isExpanded}>
                            <Divider sx={{ my: 1.5 }} />
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.8 }}
                            >
                              Detected Plate Items:
                            </Typography>
                            <Stack spacing={0.6}>
                              {meal.items.map((item, idx) => (
                                <Stack
                                  key={idx}
                                  direction="row"
                                  justifyContent="space-between"
                                  sx={{
                                    px: 1.2,
                                    py: 0.6,
                                    borderRadius: 2,
                                    bgcolor: 'rgba(15, 23, 42, 0.5)',
                                  }}
                                >
                                  <Typography variant="caption">
                                    {item.name} ({item.portionEstimate})
                                  </Typography>
                                  <Typography variant="caption" color="primary.light" sx={{ fontWeight: 700 }}>
                                    {item.calories} kcal
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          </Collapse>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              )}
            </Box>
          </Stack>
        )}

        {activeTab === 'quests' && (
          <Stack spacing={3}>
            {/* Streak Hero Banner */}
            <Card
              elevation={0}
              sx={{
                background:
                  'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(19, 27, 46, 0.95) 100%)',
                borderColor: alpha('#F59E0B', 0.4),
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: '#FCD34D', fontWeight: 800, letterSpacing: '0.08em' }}
                    >
                      Active Logging Streak
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.2 }}>
                      {userState.streakDays} {userState.streakDays === 1 ? 'Day' : 'Days'} 🔥
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Longest Streak: <strong>{userState.longestStreak}d</strong> • Freeze Shields:{' '}
                      <strong>{userState.streakFreezes} ❄️</strong>
                    </Typography>
                  </Box>
                  <Avatar
                    sx={{
                      width: 64,
                      height: 64,
                      bgcolor: alpha('#F59E0B', 0.2),
                      fontSize: '2.2rem',
                    }}
                  >
                    🔥
                  </Avatar>
                </Stack>
              </CardContent>
            </Card>

            {/* All Daily Quests */}
            <Box>
              <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1.2 }}>
                <TrackChangesRounded color="primary" fontSize="small" />
                <Typography
                  variant="overline"
                  sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
                >
                  Today&apos;s Quests
                </Typography>
              </Stack>

              <Stack spacing={1.5}>
                {dailyQuests.map((q) => {
                  const isClaimed = claimedTodaySet.has(q.id);
                  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                  return (
                    <Card key={q.id} elevation={0}>
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          spacing={1.5}
                          sx={{ mb: 1.2 }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)', fontSize: '1.3rem' }}>
                              {q.icon}
                            </Avatar>
                            <Box>
                              <Typography variant="subtitle2">{q.title}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {q.description}
                              </Typography>
                            </Box>
                          </Stack>

                          {isClaimed ? (
                            <Chip label="Done ✓" color="success" size="small" />
                          ) : q.completed ? (
                            <Button
                              variant="contained"
                              color="secondary"
                              size="small"
                              onClick={() => handleClaimQuest(q.id, q.xpReward, q.title)}
                            >
                              Claim +{q.xpReward} XP
                            </Button>
                          ) : (
                            <Chip
                              label={`+${q.xpReward} XP`}
                              size="small"
                              color="secondary"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        <LinearProgress variant="determinate" value={pct} />
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Box>

            {/* Achievement Badges */}
            <Box>
              <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1.2 }}>
                <EmojiEventsRounded color="secondary" fontSize="small" />
                <Typography
                  variant="overline"
                  sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
                >
                  Achievement Badges ({userState.unlockedBadgeIds.length}/{ALL_BADGES.length})
                </Typography>
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 1.5,
                }}
              >
                {ALL_BADGES.map((badge) => {
                  const unlocked = userState.unlockedBadgeIds.includes(badge.id);
                  return (
                    <Card
                      key={badge.id}
                      elevation={0}
                      sx={{
                        opacity: unlocked ? 1 : 0.55,
                        borderColor: unlocked ? alpha('#10B981', 0.45) : undefined,
                        background: unlocked
                          ? 'linear-gradient(145deg, rgba(16, 185, 129, 0.16) 0%, rgba(15, 23, 42, 0.95) 100%)'
                          : undefined,
                      }}
                    >
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography sx={{ fontSize: '1.75rem' }}>{badge.icon}</Typography>
                          <Chip
                            label={`+${badge.xpReward} XP`}
                            size="small"
                            color={unlocked ? 'primary' : 'default'}
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        </Stack>
                        <Typography variant="subtitle2" sx={{ mt: 1 }}>
                          {badge.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mt: 0.3, lineHeight: 1.3 }}
                        >
                          {badge.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Box>
          </Stack>
        )}

        {activeTab === 'history' && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={0.8} alignItems="center">
              <HistoryRounded color="primary" fontSize="small" />
              <Typography
                variant="overline"
                sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
              >
                Meal Log History ({meals.length} Total)
              </Typography>
            </Stack>

            {meals.length === 0 ? (
              <Card elevation={0} sx={{ textAlign: 'center', py: 5, px: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Your logged meals will appear here.
                </Typography>
              </Card>
            ) : (
              meals.map((meal) => (
                <Card key={meal.id} elevation={0}>
                  <CardContent
                    sx={{
                      p: 2,
                      '&:last-child': { pb: 2 },
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar
                        src={meal.photoDataUrl}
                        variant="rounded"
                        sx={{ width: 50, height: 50, borderRadius: 2.5, fontSize: '1.4rem' }}
                      >
                        {meal.emoji}
                      </Avatar>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {meal.dateKey} • {meal.mealType.toUpperCase()}
                        </Typography>
                        <Typography variant="subtitle2">
                          {meal.emoji} {meal.mealName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Health Score: {meal.healthScore}/100 • P: {meal.macros.proteinGrams}g
                        </Typography>
                      </Box>
                    </Stack>

                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="subtitle1" color="primary.light" sx={{ fontWeight: 800 }}>
                        {meal.totalCalories} kcal
                      </Typography>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteMeal(meal.id)}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        )}

        {activeTab === 'settings' && (
          <Box component="form" onSubmit={handleSaveSettings}>
            <Stack spacing={2.5}>
              {settingsSavedBanner && (
                <Alert
                  severity="success"
                  onClose={() => setSettingsSavedBanner(false)}
                  sx={{ borderRadius: 3 }}
                >
                  Settings saved to your device!
                </Alert>
              )}

              {/* Gemini AI Model Selection Card */}
              <Card elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <MemoryRounded color="primary" fontSize="small" />
                    <Typography variant="subtitle1">Gemini Vision Model</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Choose a <strong>100% Free Tier</strong> model (recommended) or the Paid Flagship model.
                  </Typography>

                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Active Gemini Model"
                    value={userState.selectedModel}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        selectedModel: e.target.value as GeminiModelId,
                      })
                    }
                  >
                    {AVAILABLE_GEMINI_MODELS.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {m.name}
                          </Typography>
                          <Chip
                            label={m.tierLabel}
                            size="small"
                            color={m.isFreeTier ? 'primary' : 'secondary'}
                            sx={{ height: 18, fontSize: '0.6rem' }}
                          />
                        </Stack>
                      </MenuItem>
                    ))}
                  </TextField>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1.2 }}
                  >
                    {activeModelMeta.description}
                  </Typography>
                </CardContent>
              </Card>

              {/* Gemini API Key Card */}
              <Card elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 1 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <KeyRounded color="primary" fontSize="small" />
                      <Typography variant="subtitle1">Google AI Studio API Key</Typography>
                    </Stack>
                    {hasBuiltInApiKey() && (
                      <Chip
                        label="GitHub Secret Active"
                        color="primary"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Get a free API key at <code>aistudio.google.com</code> and paste it below.
                  </Typography>

                  <TextField
                    fullWidth
                    size="small"
                    label="Gemini API Key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      hasBuiltInApiKey() ? 'Using baked-in key (paste to override)' : 'AIzaSy...'
                    }
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setShowApiKey((s) => !s)}
                              edge="end"
                            >
                              {showApiKey ? <VisibilityOffRounded /> : <VisibilityRounded />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </CardContent>
              </Card>

              {/* Daily Calorie & Macro Targets */}
              <Card elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <TrackChangesRounded color="primary" fontSize="small" />
                    <Typography variant="subtitle1">Daily Calorie &amp; Macro Targets</Typography>
                  </Stack>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 2,
                    }}
                  >
                    <TextField
                      label="Daily Calories (kcal)"
                      type="number"
                      size="small"
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
                    />
                    <TextField
                      label="Protein (g)"
                      type="number"
                      size="small"
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
                    />
                    <TextField
                      label="Carbs (g)"
                      type="number"
                      size="small"
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
                    />
                    <TextField
                      label="Fat (g)"
                      type="number"
                      size="small"
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
                    />
                  </Box>
                </CardContent>
              </Card>

              {/* Personal Dietary Context */}
              <Card elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <AutoAwesomeRounded color="primary" fontSize="small" />
                    <Typography variant="subtitle1">Personal Diet Context</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Optional persistent context included with every food photo scan.
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    placeholder="E.g., Home-cooked Indian meals, 1 tsp ghee on rotis, medium bowl is 300ml..."
                    value={userState.customPromptInstruction}
                    onChange={(e) =>
                      setUserState({
                        ...userState,
                        customPromptInstruction: e.target.value,
                      })
                    }
                  />
                </CardContent>
              </Card>

              <Button type="submit" variant="contained" color="primary" size="large" fullWidth>
                Save Settings
              </Button>

              {/* Local Data Backup Card */}
              <Card elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    Local Device Backup
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<FileDownloadRounded />}
                      onClick={handleExportData}
                    >
                      Export JSON
                    </Button>
                    <Button
                      fullWidth
                      variant="outlined"
                      color="info"
                      startIcon={<FileUploadRounded />}
                      onClick={() => importJsonInputRef.current?.click()}
                    >
                      Import JSON
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Box>
        )}
      </Container>

      {/* Material Fullscreen Dialog for AI Food Scanner */}
      <Dialog
        fullScreen
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        TransitionComponent={SlideUpTransition}
        PaperProps={{
          sx: {
            bgcolor: 'background.default',
            maxWidth: 480,
            mx: 'auto',
          },
        }}
      >
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: alpha('#0B0F19', 0.9),
            backdropFilter: 'blur(14px)',
            borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoAwesomeRounded color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                AI Food Scanner
              </Typography>
              <Chip
                label={activeModelMeta.isFreeTier ? 'FREE TIER' : 'PAID'}
                size="small"
                color={activeModelMeta.isFreeTier ? 'primary' : 'secondary'}
                sx={{ height: 20, fontSize: '0.62rem' }}
              />
            </Stack>
            <IconButton edge="end" onClick={() => setScannerOpen(false)}>
              <CloseRounded />
            </IconButton>
          </Toolbar>
        </AppBar>

        <DialogContent sx={{ p: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Captured Photo Preview */}
            {capturedImage && (
              <Box
                sx={{
                  position: 'relative',
                  borderRadius: 4,
                  overflow: 'hidden',
                  maxHeight: 230,
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                }}
              >
                <Box
                  component="img"
                  src={capturedImage.dataUrl}
                  alt="Captured meal"
                  sx={{ width: '100%', maxHeight: 230, objectFit: 'cover', display: 'block' }}
                />
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<PhotoCameraRounded />}
                  onClick={() => handleStartCapture('camera')}
                  sx={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    bgcolor: 'rgba(11, 15, 25, 0.85)',
                    color: '#fff',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  Retake
                </Button>
              </Box>
            )}

            {/* Meal Type ToggleButtonGroup */}
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              value={mealType}
              onChange={(_, val) => val && setMealType(val)}
            >
              <ToggleButton value="breakfast">Breakfast</ToggleButton>
              <ToggleButton value="lunch">Lunch</ToggleButton>
              <ToggleButton value="dinner">Dinner</ToggleButton>
              <ToggleButton value="snack">Snack</ToggleButton>
            </ToggleButtonGroup>

            {!analysisResult && (
              <Stack spacing={2}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="AI Model"
                  value={userState.selectedModel}
                  onChange={(e) =>
                    setUserState({
                      ...userState,
                      selectedModel: e.target.value as GeminiModelId,
                    })
                  }
                >
                  {AVAILABLE_GEMINI_MODELS.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name} ({m.tierLabel})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  fullWidth
                  size="small"
                  label="Optional Note About This Meal"
                  placeholder="e.g., 200g chicken breast, cooked with 1 tbsp butter..."
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                />

                {analysisError && (
                  <Alert severity="error" sx={{ borderRadius: 3 }}>
                    {analysisError}
                  </Alert>
                )}

                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  color="primary"
                  disabled={isAnalyzing}
                  startIcon={
                    isAnalyzing ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <AutoAwesomeRounded />
                    )
                  }
                  onClick={handleRunGeminiAnalysis}
                  sx={{ py: 1.6 }}
                >
                  {isAnalyzing
                    ? `Analyzing with ${activeModelMeta.name}...`
                    : `Calculate Calories (${activeModelMeta.name})`}
                </Button>
              </Stack>
            )}

            {/* Interactive Analysis Results */}
            {analysisResult && adjustedAnalysis && (
              <Stack spacing={2.5}>
                <Card elevation={0}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Chip
                          label={`Health Score: ${analysisResult.healthScore}/100`}
                          color="primary"
                          size="small"
                          sx={{ mb: 0.8 }}
                        />
                        <Typography variant="h6">
                          {analysisResult.emoji} {analysisResult.mealName}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h4" color="primary.light" sx={{ fontWeight: 900 }}>
                          {adjustedAnalysis.totalCalories}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          KCAL
                        </Typography>
                      </Box>
                    </Stack>

                    {/* 4 Macro Tiles */}
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 1,
                        mt: 2,
                      }}
                    >
                      <Paper
                        sx={{
                          p: 1,
                          textAlign: 'center',
                          borderRadius: 2.5,
                          bgcolor: 'rgba(11, 15, 25, 0.7)',
                        }}
                      >
                        <Typography variant="caption" sx={{ color: '#FDA4AF', fontWeight: 700, display: 'block' }}>
                          Protein
                        </Typography>
                        <Typography variant="subtitle2">
                          {adjustedAnalysis.macros.proteinGrams}g
                        </Typography>
                      </Paper>
                      <Paper
                        sx={{
                          p: 1,
                          textAlign: 'center',
                          borderRadius: 2.5,
                          bgcolor: 'rgba(11, 15, 25, 0.7)',
                        }}
                      >
                        <Typography variant="caption" sx={{ color: '#FDE68A', fontWeight: 700, display: 'block' }}>
                          Carbs
                        </Typography>
                        <Typography variant="subtitle2">
                          {adjustedAnalysis.macros.carbsGrams}g
                        </Typography>
                      </Paper>
                      <Paper
                        sx={{
                          p: 1,
                          textAlign: 'center',
                          borderRadius: 2.5,
                          bgcolor: 'rgba(11, 15, 25, 0.7)',
                        }}
                      >
                        <Typography variant="caption" sx={{ color: '#BAE6FD', fontWeight: 700, display: 'block' }}>
                          Fat
                        </Typography>
                        <Typography variant="subtitle2">
                          {adjustedAnalysis.macros.fatGrams}g
                        </Typography>
                      </Paper>
                      <Paper
                        sx={{
                          p: 1,
                          textAlign: 'center',
                          borderRadius: 2.5,
                          bgcolor: 'rgba(11, 15, 25, 0.7)',
                        }}
                      >
                        <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.3}>
                          <GrassRounded sx={{ fontSize: 12, color: '#6EE7B7' }} />
                          <Typography variant="caption" sx={{ color: '#6EE7B7', fontWeight: 700 }}>
                            Fiber
                          </Typography>
                        </Stack>
                        <Typography variant="subtitle2">
                          {adjustedAnalysis.macros.fiberGrams}g
                        </Typography>
                      </Paper>
                    </Box>

                    <Alert
                      icon={<AutoAwesomeRounded fontSize="small" />}
                      severity="success"
                      variant="outlined"
                      sx={{ mt: 2, borderRadius: 2.5 }}
                    >
                      &ldquo;{analysisResult.wittyFeedback}&rdquo;
                    </Alert>
                  </CardContent>
                </Card>

                {/* Portion Size Material Slider */}
                <Card elevation={0}>
                  <CardContent sx={{ px: 2.5, py: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">Portion Multiplier</Typography>
                      <Chip label={`${portionMultiplier}x`} color="primary" size="small" />
                    </Stack>
                    <Slider
                      value={portionMultiplier}
                      min={0.5}
                      max={2.0}
                      step={0.25}
                      marks={[
                        { value: 0.5, label: '0.5x' },
                        { value: 1, label: '1x' },
                        { value: 1.5, label: '1.5x' },
                        { value: 2, label: '2x' },
                      ]}
                      onChange={(_, val) => setPortionMultiplier(val as number)}
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>

                {/* Itemized Plate Checklist */}
                <Card elevation={0}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ px: 1.5, pt: 0.5, display: 'block', fontWeight: 700 }}
                    >
                      DETECTED ITEMS (TAP TO INCLUDE / EXCLUDE)
                    </Typography>
                    <List dense disablePadding>
                      {analysisResult.items.map((item, idx) => {
                        const included = item.included !== false;
                        return (
                          <ListItem
                            key={idx}
                            disablePadding
                            secondaryAction={
                              <Typography
                                variant="caption"
                                color={included ? 'primary.light' : 'text.disabled'}
                                sx={{ fontWeight: 800 }}
                              >
                                {Math.round(item.calories * portionMultiplier)} kcal
                              </Typography>
                            }
                          >
                            <ListItemButton
                              onClick={() => handleToggleDetectedItem(idx)}
                              sx={{ borderRadius: 2 }}
                            >
                              <ListItemIcon sx={{ minWidth: 34 }}>
                                <Checkbox
                                  edge="start"
                                  checked={included}
                                  tabIndex={-1}
                                  disableRipple
                                  size="small"
                                />
                              </ListItemIcon>
                              <ListItemText
                                primary={item.name}
                                secondary={`${item.portionEstimate} • P:${item.proteinGrams}g C:${item.carbsGrams}g F:${item.fatGrams}g`}
                                sx={{
                                  textDecoration: included ? 'none' : 'line-through',
                                  opacity: included ? 1 : 0.45,
                                }}
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </List>
                  </CardContent>
                </Card>

                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    color="inherit"
                    onClick={() => setAnalysisResult(null)}
                    sx={{ px: 2.5 }}
                  >
                    Re-Scan
                  </Button>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    color="primary"
                    onClick={handleSaveScannedMeal}
                  >
                    Log Meal (+{calculateMealXp(analysisResult.healthScore).totalXp} XP)
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Material BottomNavigation + Floating Camera FAB */}
      <Paper
        elevation={12}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 480,
          zIndex: 30,
          borderTop: '1px solid rgba(148, 163, 184, 0.14)',
          bgcolor: alpha('#0B0F19', 0.94),
          backdropFilter: 'blur(16px)',
        }}
      >
        <Box sx={{ position: 'relative' }}>
          <Fab
            color="primary"
            aria-label="Snap Meal Photo"
            onClick={() => handleStartCapture('camera')}
            sx={{
              position: 'absolute',
              top: -26,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2,
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.5)',
            }}
          >
            <AddAPhotoRounded />
          </Fab>

          <BottomNavigation
            showLabels
            value={activeTab}
            onChange={(_, newValue) => {
              if (newValue) setActiveTab(newValue);
            }}
            sx={{ bgcolor: 'transparent', height: 68 }}
          >
            <BottomNavigationAction
              label="Today"
              value="today"
              icon={<RestaurantMenuRounded />}
            />
            <BottomNavigationAction
              label="Quests"
              value="quests"
              icon={<EmojiEventsRounded />}
              sx={{ mr: 4 }}
            />
            <BottomNavigationAction
              label="History"
              value="history"
              icon={<HistoryRounded />}
              sx={{ ml: 4 }}
            />
            <BottomNavigationAction
              label="Settings"
              value="settings"
              icon={<SettingsRounded />}
            />
          </BottomNavigation>
        </Box>
      </Paper>
    </Box>
  );
}

export default App;
