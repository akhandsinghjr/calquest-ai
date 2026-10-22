import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bookmark,
  Check,
  Droplets,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import type { MealLog, SavedMealTemplate } from '../types';

const MODAL_SPRING = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 28,
};

/**
 * Water / Hydration Tracker Card with Standard Glass (250ml), Bottle (500ml),
 * Large Bottle (750ml), Undo (-250ml), and Custom ml Input.
 */
export function HydrationTrackerCard({
  dateLabel,
  currentWaterMl,
  targetWaterMl,
  onAddWater,
  onSetWater,
}: {
  dateLabel: string;
  currentWaterMl: number;
  targetWaterMl: number;
  onAddWater: (deltaMl: number) => void;
  onSetWater: (exactMl: number) => void;
}) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMlText, setCustomMlText] = useState('');

  const safeTarget = Math.max(500, targetWaterMl || 2700);
  const pct = Math.min(100, Math.round((currentWaterMl / safeTarget) * 100));
  const glassesCount = Math.round((currentWaterMl / 250) * 10) / 10;

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseInt(customMlText, 10);
    if (!Number.isNaN(val) && val > 0) {
      onAddWater(val);
      setCustomMlText('');
      setShowCustomInput(false);
    }
  }

  return (
    <section className="rounded-[34px] bg-m3-surfaceContainer border border-white/[0.08] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[20px] bg-m3-sage/20 border border-m3-sage/40 flex items-center justify-center text-m3-sage shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-m3-sage font-bold block">
              Hydration • {dateLabel}
            </span>
            <h2 className="text-lg font-display font-extrabold text-m3-cream tracking-tight">
              Water Intake
            </h2>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-2xl font-mono tabular-nums font-extrabold text-m3-cream">
              {currentWaterMl}
            </span>
            <span className="text-xs font-mono text-m3-sand">/ {safeTarget} ml</span>
          </div>
          <span className="text-xs font-mono text-m3-sage block">
            {glassesCount} glasses ({pct}%)
          </span>
        </div>
      </div>

      {/* Smooth Rounded Water Progress Bar */}
      <div className="w-full h-3.5 bg-m3-surfaceLow rounded-full overflow-hidden p-0.5 border border-white/[0.05]">
        <motion.div
          className="h-full bg-m3-sage rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
        />
      </div>

      {/* Standard Quick-Add Buttons: Glass (250ml), Bottle (500ml), Sipper (750ml), Custom */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onAddWater(250)}
          className="py-3 px-2 rounded-[22px] bg-m3-surfaceLow hover:bg-m3-surfaceHigh border border-white/[0.07] text-center active:scale-95 transition-all"
        >
          <span className="text-xs font-display font-extrabold text-m3-cream block">
            + Glass
          </span>
          <span className="text-xs font-mono text-m3-sage font-bold">250 ml</span>
        </button>

        <button
          type="button"
          onClick={() => onAddWater(500)}
          className="py-3 px-2 rounded-[22px] bg-m3-surfaceLow hover:bg-m3-surfaceHigh border border-white/[0.07] text-center active:scale-95 transition-all"
        >
          <span className="text-xs font-display font-extrabold text-m3-cream block">
            + Bottle
          </span>
          <span className="text-xs font-mono text-m3-sage font-bold">500 ml</span>
        </button>

        <button
          type="button"
          onClick={() => onAddWater(750)}
          className="py-3 px-2 rounded-[22px] bg-m3-surfaceLow hover:bg-m3-surfaceHigh border border-white/[0.07] text-center active:scale-95 transition-all"
        >
          <span className="text-xs font-display font-extrabold text-m3-cream block">
            + Large
          </span>
          <span className="text-xs font-mono text-m3-sage font-bold">750 ml</span>
        </button>

        <button
          type="button"
          onClick={() => setShowCustomInput((v) => !v)}
          className={`py-3 px-2 rounded-[22px] border text-center active:scale-95 transition-all ${
            showCustomInput
              ? 'bg-m3-sage text-m3-surface border-m3-sage font-extrabold'
              : 'bg-m3-surfaceLow hover:bg-m3-surfaceHigh border-white/[0.07] text-m3-cream'
          }`}
        >
          <span className="text-xs font-display font-extrabold block">Custom</span>
          <span className="text-xs font-mono opacity-80">ml / edit</span>
        </button>
      </div>

      {/* Expandable Custom Water Input + Undo / Reset Row */}
      {showCustomInput && (
        <form onSubmit={handleCustomSubmit} className="pt-1 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={customMlText}
              onChange={(e) => setCustomMlText(e.target.value)}
              placeholder="Enter custom ml (e.g. 330)"
              className="flex-1 px-4 py-2.5 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-sm font-mono text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-sage"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-full bg-m3-sage text-m3-surface font-display font-extrabold text-xs active:scale-95 transition-transform"
            >
              Add ml
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => onAddWater(-250)}
              disabled={currentWaterMl <= 0}
              className="px-3.5 py-1.5 rounded-full bg-m3-surfaceLow border border-white/[0.07] text-m3-sand disabled:opacity-40 flex items-center gap-1"
            >
              <Minus className="w-3.5 h-3.5" />
              <span>Subtract 250 ml</span>
            </button>

            <button
              type="button"
              onClick={() => onSetWater(0)}
              disabled={currentWaterMl <= 0}
              className="px-3.5 py-1.5 rounded-full bg-m3-surfaceLow border border-white/[0.07] text-m3-muted hover:text-m3-rose disabled:opacity-40 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Day's Water</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Full Edit Meal Modal for editing any logged meal in Today or Journal
 */
export function EditMealModal({
  meal,
  onClose,
  onSave,
  onDelete,
  onSaveAsTemplate,
}: {
  meal: MealLog;
  onClose: () => void;
  onSave: (updated: MealLog) => void;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (meal: MealLog) => void;
}) {
  const [mealName, setMealName] = useState(meal.mealName);
  const [mealType, setMealType] = useState<MealLog['mealType']>(meal.mealType);
  const [dateKey, setDateKey] = useState(meal.dateKey);
  const [caloriesStr, setCaloriesStr] = useState(String(meal.totalCalories));
  const [proteinStr, setProteinStr] = useState(String(meal.macros.proteinGrams));
  const [carbsStr, setCarbsStr] = useState(String(meal.macros.carbsGrams));
  const [fatStr, setFatStr] = useState(String(meal.macros.fatGrams));
  const [fiberStr, setFiberStr] = useState(String(meal.macros.fiberGrams));
  const [userNote, setUserNote] = useState(meal.userNote || '');
  const [savedPinToast, setSavedPinToast] = useState(false);

  function applyScale(factor: number) {
    const baseCal = Number(caloriesStr) || meal.totalCalories;
    const baseP = Number(proteinStr) || meal.macros.proteinGrams;
    const baseC = Number(carbsStr) || meal.macros.carbsGrams;
    const baseF = Number(fatStr) || meal.macros.fatGrams;
    const baseFib = Number(fiberStr) || meal.macros.fiberGrams;

    setCaloriesStr(String(Math.round(baseCal * factor)));
    setProteinStr(String(Math.round(baseP * factor)));
    setCarbsStr(String(Math.round(baseC * factor)));
    setFatStr(String(Math.round(baseF * factor)));
    setFiberStr(String(Math.round(baseFib * factor)));
  }

  function handleSaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    const updated: MealLog = {
      ...meal,
      mealName: mealName.trim() || 'Logged Meal',
      mealType,
      dateKey: dateKey || meal.dateKey,
      totalCalories: Math.max(0, Math.round(Number(caloriesStr) || 0)),
      macros: {
        proteinGrams: Math.max(0, Math.round(Number(proteinStr) || 0)),
        carbsGrams: Math.max(0, Math.round(Number(carbsStr) || 0)),
        fatGrams: Math.max(0, Math.round(Number(fatStr) || 0)),
        fiberGrams: Math.max(0, Math.round(Number(fiberStr) || 0)),
      },
      userNote: userNote.trim() || undefined,
    };
    onSave(updated);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <motion.form
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={MODAL_SPRING}
        onSubmit={handleSaveSubmit}
        className="w-full max-w-md rounded-[36px] bg-m3-surfaceContainer border border-m3-primary/35 p-6 space-y-4 shadow-2xl my-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-m3-primaryContainer border border-m3-primary/30 flex items-center justify-center text-m3-primary">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-m3-primary font-bold block">
                Edit Journal Entry
              </span>
              <h3 className="text-lg font-display font-extrabold text-m3-cream">
                Modify Meal & Macros
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-sand hover:text-m3-cream"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meal Name & Date */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-m3-sand mb-1">Meal Name</label>
            <input
              type="text"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-sm font-display font-bold text-m3-cream focus:outline-none focus:border-m3-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-m3-sand mb-1">Meal Category</label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealLog['mealType'])}
                className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-xs font-display font-bold text-m3-cream capitalize"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-m3-sand mb-1">Journal Date</label>
              <input
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-xs font-mono text-m3-cream"
              />
            </div>
          </div>
        </div>

        {/* Quick Portion Rescale Pills */}
        <div>
          <span className="block text-xs font-bold text-m3-sand mb-1.5">
            Quick Portion Scale Adjust
          </span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '0.5x Half', factor: 0.5 },
              { label: '0.75x', factor: 0.75 },
              { label: '1.25x', factor: 1.25 },
              { label: '1.5x Large', factor: 1.5 },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => applyScale(s.factor)}
                className="py-2 rounded-full bg-m3-surfaceLow hover:bg-m3-surfaceHigh border border-white/[0.07] text-xs font-mono font-bold text-m3-sand hover:text-m3-cream active:scale-95 transition-all"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Direct Calorie & Macro Inputs (String state so typing/backspacing is smooth) */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-3 sm:col-span-1">
            <label className="block text-xs font-bold text-m3-primary mb-1">
              Calories (kcal)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={caloriesStr}
              onChange={(e) => setCaloriesStr(e.target.value)}
              className="w-full px-4 py-3 rounded-[20px] bg-m3-surfaceLow border border-m3-primary/40 text-lg font-mono tabular-nums font-extrabold text-m3-primary text-center"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-m3-sand mb-1">Protein (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={proteinStr}
              onChange={(e) => setProteinStr(e.target.value)}
              className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-base font-mono tabular-nums font-bold text-m3-cream text-center"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-m3-sand mb-1">Carbs (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={carbsStr}
              onChange={(e) => setCarbsStr(e.target.value)}
              className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-base font-mono tabular-nums font-bold text-m3-amber text-center"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-m3-sand mb-1">Fat (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={fatStr}
              onChange={(e) => setFatStr(e.target.value)}
              className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-base font-mono tabular-nums font-bold text-m3-rose text-center"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-m3-sand mb-1">Fiber (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={fiberStr}
              onChange={(e) => setFiberStr(e.target.value)}
              className="w-full px-3 py-3 rounded-[20px] bg-m3-surfaceLow border border-white/[0.1] text-base font-mono tabular-nums font-bold text-m3-sage text-center"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                onSaveAsTemplate({
                  ...meal,
                  mealName: mealName.trim() || meal.mealName,
                  mealType,
                  totalCalories: Math.max(0, Math.round(Number(caloriesStr) || 0)),
                  macros: {
                    proteinGrams: Math.max(0, Math.round(Number(proteinStr) || 0)),
                    carbsGrams: Math.max(0, Math.round(Number(carbsStr) || 0)),
                    fatGrams: Math.max(0, Math.round(Number(fatStr) || 0)),
                    fiberGrams: Math.max(0, Math.round(Number(fiberStr) || 0)),
                  },
                });
                setSavedPinToast(true);
              }}
              className="w-full py-3 px-2 rounded-[20px] bg-m3-primaryContainer border border-m3-primary/35 text-m3-onPrimaryContainer text-xs font-display font-bold flex items-center justify-center gap-1"
            >
              <Bookmark className="w-3.5 h-3.5 text-m3-primary" />
              <span>{savedPinToast ? 'Saved!' : 'Pin Staple'}</span>
            </button>
          </div>
        </div>

        {/* Optional Note */}
        <div>
          <label className="block text-xs font-bold text-m3-sand mb-1">Meal Note</label>
          <input
            type="text"
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Optional note..."
            className="w-full px-4 py-2.5 rounded-full bg-m3-surfaceLow border border-white/[0.08] text-xs text-m3-cream"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              onDelete(meal.id);
              onClose();
            }}
            className="p-3.5 rounded-full bg-m3-rose/15 border border-m3-rose/35 text-m3-rose hover:bg-m3-rose/25"
            title="Delete Meal"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="submit"
            className="flex-1 py-3.5 px-6 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Save Changes</span>
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

/**
 * Repetitive / Frequent Meals & Quick Custom Entry Drawer/Modal
 */
export function FrequentMealsModal({
  targetDateKey,
  frequentMeals,
  onClose,
  onQuickLogTemplate,
  onDeleteTemplate,
}: {
  targetDateKey: string;
  frequentMeals: SavedMealTemplate[];
  onClose: () => void;
  onQuickLogTemplate: (template: Omit<SavedMealTemplate, 'id' | 'useCount' | 'lastUsedAt'>, saveToStaples: boolean) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const [mode, setMode] = useState<'frequent' | 'custom'>(
    frequentMeals.length > 0 ? 'frequent' : 'custom'
  );
  const [mealName, setMealName] = useState('');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [caloriesStr, setCaloriesStr] = useState('');
  const [proteinStr, setProteinStr] = useState('');
  const [carbsStr, setCarbsStr] = useState('');
  const [fatStr, setFatStr] = useState('');
  const [fiberStr, setFiberStr] = useState('4');
  const [saveAsStaple, setSaveAsStaple] = useState(true);

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cal = Math.max(0, Math.round(Number(caloriesStr) || 0));
    const prot = Math.max(0, Math.round(Number(proteinStr) || 0));
    const carbs = Math.max(0, Math.round(Number(carbsStr) || 0));
    const fat = Math.max(0, Math.round(Number(fatStr) || 0));
    const fib = Math.max(0, Math.round(Number(fiberStr) || 0));

    const resolvedCal = cal > 0 ? cal : prot * 4 + carbs * 4 + fat * 9;

    onQuickLogTemplate(
      {
        mealName: mealName.trim() || 'Quick Meal',
        mealType,
        totalCalories: resolvedCal,
        macros: {
          proteinGrams: prot,
          carbsGrams: carbs,
          fatGrams: fat,
          fiberGrams: fib,
        },
        healthScore: 82,
      },
      saveAsStaple
    );
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={MODAL_SPRING}
        className="w-full max-w-md rounded-[36px] bg-m3-surfaceContainer border border-m3-primary/35 p-6 space-y-4 shadow-2xl my-auto"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-m3-primary font-bold block">
              Log to {targetDateKey}
            </span>
            <h3 className="text-xl font-display font-extrabold text-m3-cream">
              Frequent & Quick Add
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full bg-m3-surfaceLow text-m3-sand hover:text-m3-cream"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-1.5 rounded-full bg-m3-surfaceLow border border-white/[0.07] grid grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('frequent')}
            className={`py-2.5 rounded-full text-xs font-display font-extrabold transition-all ${
              mode === 'frequent' ? 'bg-m3-primary text-m3-surface' : 'text-m3-sand'
            }`}
          >
            Repetitive / Staples ({frequentMeals.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`py-2.5 rounded-full text-xs font-display font-extrabold transition-all ${
              mode === 'custom' ? 'bg-m3-primary text-m3-surface' : 'text-m3-sand'
            }`}
          >
            + Custom Food Entry
          </button>
        </div>

        {mode === 'frequent' ? (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {frequentMeals.length === 0 ? (
              <div className="p-6 rounded-[28px] bg-m3-surfaceLow text-center space-y-2">
                <Utensils className="w-6 h-6 text-m3-primary mx-auto" />
                <p className="text-sm font-display font-bold text-m3-cream">
                  No repetitive staples saved yet
                </p>
                <p className="text-xs text-m3-sand">
                  Every meal you scan or create in "+ Custom Food Entry" will appear here for 1-tap re-logging.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  className="mt-2 px-4 py-2 rounded-full bg-m3-primary text-m3-surface text-xs font-display font-extrabold"
                >
                  Create First Staple Meal
                </button>
              </div>
            ) : (
              frequentMeals.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-[26px] bg-m3-surfaceLow border border-white/[0.07] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold text-m3-primary">
                        {item.mealType}
                      </span>
                      {item.useCount > 1 && (
                        <span className="text-xs font-mono text-m3-muted">
                          logged {item.useCount}×
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-display font-extrabold text-m3-cream truncate">
                      {item.mealName}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-m3-sand mt-0.5">
                      {item.totalCalories} kcal • P {item.macros.proteinGrams}g • C{' '}
                      {item.macros.carbsGrams}g • F {item.macros.fatGrams}g
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.id.startsWith('tpl_') && (
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(item.id)}
                        className="p-2 rounded-full text-m3-muted hover:text-m3-rose"
                        title="Remove staple"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onQuickLogTemplate(
                          {
                            mealName: item.mealName,
                            mealType: item.mealType,
                            totalCalories: item.totalCalories,
                            macros: item.macros,
                            healthScore: item.healthScore || 80,
                          },
                          false
                        );
                        onClose();
                      }}
                      className="px-4 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-m3-sand mb-1">
                Food / Meal Name (e.g. Whey Protein Shake, 3 Boiled Eggs)
              </label>
              <input
                type="text"
                required
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                placeholder="Enter meal or food name..."
                className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-sm font-display font-bold text-m3-cream placeholder-m3-muted focus:outline-none focus:border-m3-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-m3-sand mb-1">Meal Type</label>
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealLog['mealType'])}
                  className="w-full px-4 py-3 rounded-full bg-m3-surfaceLow border border-white/[0.1] text-xs font-display font-bold text-m3-cream capitalize"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-m3-primary mb-1">
                  Calories (kcal)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={caloriesStr}
                  onChange={(e) => setCaloriesStr(e.target.value)}
                  placeholder="Auto from macros"
                  className="w-full px-4 py-2.5 rounded-full bg-m3-surfaceLow border border-m3-primary/40 text-sm font-mono font-bold text-m3-primary placeholder-m3-muted"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-m3-sand mb-1">Protein (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={proteinStr}
                  onChange={(e) => setProteinStr(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.1] text-sm font-mono font-bold text-m3-cream text-center"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-m3-sand mb-1">Carbs (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={carbsStr}
                  onChange={(e) => setCarbsStr(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.1] text-sm font-mono font-bold text-m3-amber text-center"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-m3-sand mb-1">Fat (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={fatStr}
                  onChange={(e) => setFatStr(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-[18px] bg-m3-surfaceLow border border-white/[0.1] text-sm font-mono font-bold text-m3-rose text-center"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSaveAsStaple((v) => !v)}
              className={`w-full px-4 py-2.5 rounded-full border text-xs font-display font-bold flex items-center justify-between ${
                saveAsStaple
                  ? 'bg-m3-primaryContainer border-m3-primary/40 text-m3-onPrimaryContainer'
                  : 'bg-m3-surfaceLow border-white/[0.07] text-m3-sand'
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-m3-primary" />
                <span>Save to Repetitive Staples for 1-Tap Re-Log</span>
              </span>
              <span>{saveAsStaple ? 'Yes' : 'No'}</span>
            </button>

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-m3-primary hover:bg-m3-primarySoft text-m3-surface font-display font-extrabold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Log Meal Now</span>
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
