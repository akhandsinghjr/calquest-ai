import type { Badge, DailyQuest, MealLog, UserGoals, UserState } from '../types';

export const RANK_TITLES: { minLevel: number; title: string; badgeEmoji: string }[] = [
  { minLevel: 1, title: 'Calorie Cadet', badgeEmoji: '🌱' },
  { minLevel: 3, title: 'Macro Scout', badgeEmoji: '🧭' },
  { minLevel: 5, title: 'Portion Paladin', badgeEmoji: '🛡️' },
  { minLevel: 8, title: 'Nutri-Knight', badgeEmoji: '⚔️' },
  { minLevel: 12, title: 'Metabolic Mage', badgeEmoji: '🔮' },
  { minLevel: 16, title: 'Macro Grandmaster', badgeEmoji: '👑' },
  { minLevel: 20, title: 'Metabolic Sovereign', badgeEmoji: '⚡' },
];

export const ALL_BADGES: Badge[] = [
  {
    id: 'first_snap',
    title: 'First Snap',
    description: 'Log your very first meal using camera food vision.',
    icon: '📸',
    xpReward: 100,
  },
  {
    id: 'streak_3',
    title: '3-Day Spark',
    description: 'Maintain a 3-day meal logging streak.',
    icon: '🔥',
    xpReward: 150,
  },
  {
    id: 'streak_7',
    title: '7-Day Inferno',
    description: 'Maintain a full 7-day logging streak.',
    icon: '🌋',
    xpReward: 350,
  },
  {
    id: 'streak_14',
    title: 'Unstoppable Force',
    description: 'Reach a 14-day calorie tracking streak.',
    icon: '☄️',
    xpReward: 700,
  },
  {
    id: 'clean_eater',
    title: 'Clean Plate Club',
    description: 'Log a meal with a Health Score of 85 or higher.',
    icon: '🥗',
    xpReward: 120,
  },
  {
    id: 'superfood_sage',
    title: 'Superfood Sage',
    description: 'Log a meal with a near-perfect Health Score of 95+.',
    icon: '🥑',
    xpReward: 250,
  },
  {
    id: 'protein_power',
    title: 'Protein Powerhouse',
    description: 'Log a single meal packing at least 40g of protein.',
    icon: '💪',
    xpReward: 150,
  },
  {
    id: 'daily_protein_hit',
    title: 'Anabolic Architect',
    description: 'Hit 100% of your daily protein target.',
    icon: '🥩',
    xpReward: 200,
  },
  {
    id: 'bullseye_budget',
    title: 'Calorie Bullseye',
    description: 'Finish a day within ±10% of your daily calorie goal (min 3 meals).',
    icon: '🎯',
    xpReward: 250,
  },
  {
    id: 'fiber_friend',
    title: 'Fiber Champion',
    description: 'Log 25g+ of dietary fiber in a single day.',
    icon: '🌾',
    xpReward: 150,
  },
  {
    id: 'meals_10',
    title: 'Dedicated Logger',
    description: 'Snap and log 10 total meals.',
    icon: '🏅',
    xpReward: 250,
  },
  {
    id: 'meals_50',
    title: 'Master Tracker',
    description: 'Snap and log 50 total meals.',
    icon: '🏆',
    xpReward: 600,
  },
];

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLevelInfo(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  rankTitle: string;
  rankEmoji: string;
} {
  let level = 1;
  let xpForNext = 250;
  let remainingXp = Math.max(0, xp);

  while (remainingXp >= xpForNext) {
    remainingXp -= xpForNext;
    level += 1;
    xpForNext = Math.round(250 * Math.pow(1.18, level - 1));
  }

  let rankTitle = RANK_TITLES[0].title;
  let rankEmoji = RANK_TITLES[0].badgeEmoji;
  for (const r of RANK_TITLES) {
    if (level >= r.minLevel) {
      rankTitle = r.title;
      rankEmoji = r.badgeEmoji;
    }
  }

  return {
    level,
    currentLevelXp: remainingXp,
    nextLevelXp: xpForNext,
    progressPercent: Math.min(100, Math.round((remainingXp / xpForNext) * 100)),
    rankTitle,
    rankEmoji,
  };
}

export function calculateMealXp(healthScore: number): {
  baseXp: number;
  healthBonusXp: number;
  totalXp: number;
} {
  const baseXp = 50;
  const healthBonusXp = Math.round((Math.max(0, healthScore) / 100) * 50);
  return {
    baseXp,
    healthBonusXp,
    totalXp: baseXp + healthBonusXp,
  };
}

export function updateStreakOnLog(
  state: UserState,
  todayKey: string
): {
  streakDays: number;
  longestStreak: number;
  streakFreezes: number;
  usedFreeze: boolean;
} {
  if (state.lastLoggedDate === todayKey) {
    return {
      streakDays: state.streakDays,
      longestStreak: state.longestStreak,
      streakFreezes: state.streakFreezes,
      usedFreeze: false,
    };
  }

  if (!state.lastLoggedDate) {
    return {
      streakDays: 1,
      longestStreak: Math.max(1, state.longestStreak),
      streakFreezes: state.streakFreezes,
      usedFreeze: false,
    };
  }

  const lastDate = new Date(`${state.lastLoggedDate}T00:00:00`);
  const currentDate = new Date(`${todayKey}T00:00:00`);
  const diffDays = Math.round(
    (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 1) {
    const newStreak = state.streakDays + 1;
    const bonusFreeze = newStreak % 7 === 0 && state.streakFreezes < 3 ? 1 : 0;
    return {
      streakDays: newStreak,
      longestStreak: Math.max(newStreak, state.longestStreak),
      streakFreezes: state.streakFreezes + bonusFreeze,
      usedFreeze: false,
    };
  }

  if (diffDays === 2 && state.streakFreezes > 0) {
    const newStreak = state.streakDays + 1;
    return {
      streakDays: newStreak,
      longestStreak: Math.max(newStreak, state.longestStreak),
      streakFreezes: state.streakFreezes - 1,
      usedFreeze: true,
    };
  }

  return {
    streakDays: 1,
    longestStreak: Math.max(1, state.longestStreak),
    streakFreezes: state.streakFreezes,
    usedFreeze: false,
  };
}

export function computeDailyQuests(
  todayMeals: MealLog[],
  goals: UserGoals
): DailyQuest[] {
  const mealCount = todayMeals.length;
  const totalProtein = todayMeals.reduce((acc, m) => acc + m.macros.proteinGrams, 0);
  const highHealthMeals = todayMeals.filter((m) => m.healthScore >= 75).length;
  const totalCalories = todayMeals.reduce((acc, m) => acc + m.totalCalories, 0);

  return [
    {
      id: 'quest_snap_3',
      title: 'Triple Threat Logger',
      description: 'Snap & log 3 meals or snacks today',
      xpReward: 100,
      progress: Math.min(3, mealCount),
      target: 3,
      completed: mealCount >= 3,
      icon: '📷',
    },
    {
      id: 'quest_clean_meal',
      title: 'Nutrient Hunter',
      description: 'Log a meal with a Health Score of 75+',
      xpReward: 75,
      progress: Math.min(1, highHealthMeals),
      target: 1,
      completed: highHealthMeals >= 1,
      icon: '🥦',
    },
    {
      id: 'quest_protein_goal',
      title: 'Protein Vanguard',
      description: `Reach ${Math.round(goals.proteinGrams * 0.8)}g+ of protein today`,
      xpReward: 120,
      progress: Math.min(Math.round(goals.proteinGrams * 0.8), totalProtein),
      target: Math.round(goals.proteinGrams * 0.8),
      completed: totalProtein >= Math.round(goals.proteinGrams * 0.8),
      icon: '⚡',
    },
    {
      id: 'quest_calorie_zone',
      title: 'Goldilocks Zone',
      description: `Hit 80%–105% of your ${goals.dailyCalories} kcal target`,
      xpReward: 150,
      progress: Math.min(goals.dailyCalories, totalCalories),
      target: goals.dailyCalories,
      completed:
        totalCalories >= goals.dailyCalories * 0.8 &&
        totalCalories <= goals.dailyCalories * 1.05,
      icon: '🎯',
    },
  ];
}

export function evaluateNewlyUnlockedBadges(
  allMeals: MealLog[],
  todayMeals: MealLog[],
  state: UserState
): Badge[] {
  const unlockedSet = new Set(state.unlockedBadgeIds);
  const newlyUnlocked: Badge[] = [];

  const totalCaloriesToday = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
  const totalProteinToday = todayMeals.reduce((s, m) => s + m.macros.proteinGrams, 0);
  const totalFiberToday = todayMeals.reduce((s, m) => s + m.macros.fiberGrams, 0);

  const checks: Record<string, boolean> = {
    first_snap: allMeals.length >= 1,
    streak_3: state.streakDays >= 3,
    streak_7: state.streakDays >= 7,
    streak_14: state.streakDays >= 14,
    clean_eater: allMeals.some((m) => m.healthScore >= 85),
    superfood_sage: allMeals.some((m) => m.healthScore >= 95),
    protein_power: allMeals.some((m) => m.macros.proteinGrams >= 40),
    daily_protein_hit: totalProteinToday >= state.goals.proteinGrams,
    bullseye_budget:
      todayMeals.length >= 3 &&
      totalCaloriesToday >= state.goals.dailyCalories * 0.9 &&
      totalCaloriesToday <= state.goals.dailyCalories * 1.1,
    fiber_friend: totalFiberToday >= 25,
    meals_10: allMeals.length >= 10,
    meals_50: allMeals.length >= 50,
  };

  for (const badge of ALL_BADGES) {
    if (!unlockedSet.has(badge.id) && checks[badge.id]) {
      newlyUnlocked.push(badge);
    }
  }

  return newlyUnlocked;
}
