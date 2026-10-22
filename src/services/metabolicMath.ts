import type { BiometricsProfile, MetabolicCalculationResult } from '../types';

/**
 * Peer-Reviewed Metabolic & Dynamic Energy Balance Engine
 *
 * References:
 * 1. Mifflin, M. D., St Jeor, S. T., et al. (1990). "A new predictive equation for resting energy
 *    expenditure in healthy individuals." American Journal of Clinical Nutrition, 51(2), 241-247.
 * 2. Katch, F. I., & McArdle, W. D. (1973); Cunningham, J. J. (1980). "A reanalysis of the factors
 *    influencing basal metabolic rate in normal adults." Am J Clin Nutr, 33(11), 2372-2374.
 * 3. Hall, K. D., Sacks, G., Chandramohan, D., Chow, C. C., Wang, Y. C., Gortmaker, S. L., &
 *    Swinburn, B. A. (2011). "Quantification of the effect of energy imbalance on bodyweight."
 *    The Lancet, 378(9793), 826-837.
 * 4. Forbes, G. B. (1987). "Lean body mass-body fat interrelationships in humans."
 *    Nutrition Reviews, 45(8), 225-231.
 * 5. Helms, E. R., Aragon, A. A., & Fitschen, P. J. (2014). "Evidence-based recommendations for
 *    natural bodybuilding contest preparation: nutrition and supplementation." JISSN, 11(1), 20.
 * 6. Morton, R. W., et al. (2018). "A systematic review, meta-analysis and meta-regression of the
 *    effect of protein supplementation on resistance training-induced gains in muscle mass and
 *    strength in healthy adults." British Journal of Sports Medicine, 52(6), 376-384.
 */

export const DEFAULT_BIOMETRICS: BiometricsProfile = {
  sex: 'male',
  age: 24,
  heightCm: 176,
  weightKg: 76,
  targetWeightKg: 70,
  targetTimelineWeeks: 12,
  activityLevel: 'moderate',
  resistanceTraining: true,
};

export const ACTIVITY_LABELS: Record<
  BiometricsProfile['activityLevel'],
  { label: string; desc: string; pal: number }
> = {
  sedentary: {
    label: 'Sedentary',
    desc: 'Desk job, minimal planned exercise (<4,000 steps/day)',
    pal: 1.2,
  },
  light: {
    label: 'Lightly Active',
    desc: 'Light training 1-3 days/week or 6,000-8,000 steps/day',
    pal: 1.375,
  },
  moderate: {
    label: 'Moderately Active',
    desc: 'Moderate training 3-5 days/week or 8,000-10,000 steps/day',
    pal: 1.55,
  },
  very_active: {
    label: 'Very Active',
    desc: 'Hard training 6-7 days/week or active physical work',
    pal: 1.725,
  },
  athlete: {
    label: 'Athlete',
    desc: 'Intense daily training + high non-exercise physical activity',
    pal: 1.9,
  },
};

export const ACTIVITY_MULTIPLIERS: {
  value: BiometricsProfile['activityLevel'];
  label: string;
  pal: number;
  detail: string;
}[] = [
  {
    value: 'sedentary',
    label: 'Sedentary',
    pal: 1.2,
    detail: 'Desk job, minimal planned exercise (<4,000 steps/day)',
  },
  {
    value: 'light',
    label: 'Lightly Active',
    pal: 1.375,
    detail: 'Light training 1-3 days/week or 6,000-8,000 steps/day',
  },
  {
    value: 'moderate',
    label: 'Moderately Active',
    pal: 1.55,
    detail: 'Moderate training 3-5 days/week or 8,000-10,000 steps/day',
  },
  {
    value: 'very_active',
    label: 'Very Active',
    pal: 1.725,
    detail: 'Hard training 6-7 days/week or active physical job',
  },
  {
    value: 'athlete',
    label: 'Athlete',
    pal: 1.9,
    detail: 'Intense daily training + high non-exercise physical activity',
  },
];

/**
 * Estimates initial Body Fat % using the Deurenberg BMI equation
 * when the user leaves optional Body Fat % blank.
 */
export function estimateBodyFatPercentage(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: 'male' | 'female'
): number {
  const heightM = Math.max(1.2, heightCm / 100);
  const bmi = weightKg / (heightM * heightM);
  const sexFlag = sex === 'male' ? 1 : 0;
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * sexFlag - 5.4;
  return Math.max(5, Math.min(55, Math.round(bf * 10) / 10));
}

export function calculateScientificTargets(
  profile: BiometricsProfile
): MetabolicCalculationResult {
  const W0 = Math.max(30, Math.min(300, Number(profile.weightKg) || 70));
  const Wt = Math.max(30, Math.min(300, Number(profile.targetWeightKg) || W0));
  const H = Math.max(110, Math.min(240, Number(profile.heightCm) || 170));
  const A = Math.max(13, Math.min(100, Number(profile.age) || 25));
  const weeks = Math.max(1, Math.min(156, Number(profile.targetTimelineWeeks) || 12));
  const days = weeks * 7;

  // 1. Resting Metabolic Rate (RMR)
  // Mifflin-St Jeor (1990): 10*W + 6.25*H - 5*A + s (s = +5 male, -161 female)
  const s = profile.sex === 'male' ? 5 : -161;
  const rmrMifflin = 10 * W0 + 6.25 * H - 5 * A + s;

  // Body Fat % & Lean Body Mass (LBM)
  const hasExplicitBf =
    profile.bodyFatPct !== undefined &&
    profile.bodyFatPct !== null &&
    !Number.isNaN(Number(profile.bodyFatPct)) &&
    Number(profile.bodyFatPct) >= 4 &&
    Number(profile.bodyFatPct) <= 60;

  const bodyFatPct = hasExplicitBf
    ? Number(profile.bodyFatPct)
    : estimateBodyFatPercentage(W0, H, A, profile.sex);

  const fatMassKg = W0 * (bodyFatPct / 100);
  const leanMassKg = W0 - fatMassKg;

  // Katch-McArdle (1973): 370 + 21.6 * LBM
  const rmrKatch = 370 + 21.6 * leanMassKg;

  // Use Katch-McArdle when explicit bodyFatPct is provided, else Mifflin-St Jeor
  const rmr = hasExplicitBf ? rmrKatch : rmrMifflin;

  // 2. Baseline Total Daily Energy Expenditure (TDEE_0)
  const palObj =
    ACTIVITY_MULTIPLIERS.find((a) => a.value === profile.activityLevel) ||
    ACTIVITY_MULTIPLIERS[2];
  const tdee0 = rmr * palObj.pal;

  // 3. Forbes (1987) & Hall et al. (The Lancet, 2011) Energy Partitioning
  // Metabolizable energy density of human adipose tissue (~7,700 kcal/kg) and lean tissue (~1,800 kcal/kg)
  const RHO_F = 7700;
  const RHO_L = 1800;
  const FORBES_C = (10.4 * RHO_L) / RHO_F; // ~2.43 kg

  // Raw Forbes partitioning fraction p = C / (C + F0)
  // Resistance training & adequate protein (Morton 2018 / Helms 2014) preserves lean mass during cuts
  // and biases weight gain toward lean mass during surpluses
  const rawForbesP = FORBES_C / (FORBES_C + Math.max(2, fatMassKg));
  const deltaWeightKg = Wt - W0;

  let pPartition = rawForbesP;
  if (deltaWeightKg < 0) {
    // Weight loss: resistance training cuts lean mass loss fraction in half
    pPartition = profile.resistanceTraining ? rawForbesP * 0.45 : rawForbesP;
  } else if (deltaWeightKg > 0) {
    // Lean bulk: resistance training increases lean tissue accretion fraction
    pPartition = profile.resistanceTraining
      ? Math.min(0.65, rawForbesP + 0.35)
      : rawForbesP;
  }

  // Effective tissue energy density (kcal per kg of body weight change)
  const effectiveRho = pPartition * RHO_L + (1 - pPartition) * RHO_F;

  // Hall dynamic adaptation slope (epsilon = 22 kcal/kg/day), damped across the trajectory
  const HALL_EPSILON = 22;
  const tissueDailyDelta = (effectiveRho * deltaWeightKg) / days;
  const adaptationDailyDelta = 0.25 * HALL_EPSILON * deltaWeightKg;

  const rawDailyDelta =
    Math.abs(deltaWeightKg) < 0.1 ? 0 : tissueDailyDelta + adaptationDailyDelta;

  // Safety physiological floor (min 1200 kcal for females, 1400 kcal for males) & ceiling (+1000 kcal surplus)
  const minSafeCalories = profile.sex === 'male' ? 1400 : 1200;
  const maxSafeCalories = Math.round(tdee0 + 1000);
  const unclampedTargetCalories = Math.round(tdee0 + rawDailyDelta);
  const targetDailyCalories = Math.max(
    minSafeCalories,
    Math.min(maxSafeCalories, unclampedTargetCalories)
  );

  const actualDailyDelta = targetDailyCalories - Math.round(tdee0);

  // 4. Evidence-Based Macronutrient Prescription (Helms et al. 2014; Morton et al. 2018)
  // Ensure 4*P + 4*C + 9*F always reconciles cleanly with targetDailyCalories
  const refWeightForProtein = deltaWeightKg < 0 ? Math.min(W0, Wt * 1.08) : W0;
  const proteinPerKg =
    deltaWeightKg < -0.5 ? 2.0 : profile.resistanceTraining ? 1.8 : 1.6;
  const rawProteinGrams = Math.round(refWeightForProtein * proteinPerKg);
  // Cap protein at 40% of total calories so carbs/fats always have room
  const maxProteinGrams = Math.round((targetDailyCalories * 0.4) / 4);
  const proteinGrams = Math.min(rawProteinGrams, maxProteinGrams);

  // Dietary Fat: ~25-28% of total calories (or ~0.8g/kg, clamped between 20% and 32% of calories)
  const rawFatGrams = Math.round(W0 * 0.8);
  const minFatGrams = Math.round((targetDailyCalories * 0.2) / 9);
  const maxFatGrams = Math.round((targetDailyCalories * 0.32) / 9);
  const fatGrams = Math.max(minFatGrams, Math.min(maxFatGrams, rawFatGrams));

  // Remaining calories allocated to Carbohydrates (4 kcal/g) so macros sum to 100% of targetDailyCalories
  const remainingCalForCarbs = Math.max(
    80,
    targetDailyCalories - proteinGrams * 4 - fatGrams * 9
  );
  const carbsGrams = Math.round(remainingCalForCarbs / 4);

  // Fiber: IOM guideline of 14g per 1000 kcal
  const fiberGrams = Math.max(20, Math.round((targetDailyCalories / 1000) * 14));

  // Hydration: EFSA / ACSM baseline 35 ml/kg + 400 ml for resistance training / active lifestyle
  const activityWaterBonus =
    profile.activityLevel === 'very_active' || profile.activityLevel === 'athlete'
      ? 600
      : profile.resistanceTraining
      ? 400
      : 200;
  const recommendedWaterMl =
    Math.round((W0 * 35 + activityWaterBonus) / 100) * 100;

  // Weekly rate of change (kg/week)
  const weeklyRateKg = Math.round((deltaWeightKg / weeks) * 100) / 100;

  return {
    rmrMifflin: Math.round(rmrMifflin),
    rmrKatch: Math.round(rmrKatch),
    activeRmr: Math.round(rmr),
    tdee: Math.round(tdee0),
    pal: palObj.pal,
    estimatedBodyFatPct: bodyFatPct,
    leanMassKg: Math.round(leanMassKg * 10) / 10,
    fatMassKg: Math.round(fatMassKg * 10) / 10,
    forbesPartitionP: Math.round(pPartition * 1000) / 1000,
    effectiveEnergyDensityKcalPerKg: Math.round(effectiveRho),
    metabolicAdaptationKcal: Math.round(adaptationDailyDelta),
    dailyCalorieDelta: actualDailyDelta,
    targetDailyCalories,
    weeklyRateKg,
    recommendedWaterMl,
    isSafetyClamped:
      unclampedTargetCalories < minSafeCalories ||
      unclampedTargetCalories > maxSafeCalories,
    recommendedMacros: {
      proteinGrams,
      carbsGrams,
      fatGrams,
      fiberGrams,
    },
  };
}
