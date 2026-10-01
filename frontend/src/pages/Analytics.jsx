import React, { useState, useMemo, useEffect } from "react";
import {
  Activity,
  Moon,
  Utensils,
  Target,
  Users,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Droplets,
  Scale,
  Sparkles
} from "lucide-react";
import {
  LineTrendChart,
  BarTrendChart,
  CalendarTrackingMatrix,
  DualHabitChart,
  TargetProgressBar,
  CohortComparisonItem,
  parseLocalDate,
  formatLocalDate
} from "../components/analytics/AnalyticsCharts";

/**
 * Compares current value against previous value.
 * Missing values are NEVER converted to 0, 0%, or fake trends.
 */
function compareMetric(currentVal, prevVal, unit = "", isHigherBetter = true) {
  if (currentVal === null || currentVal === undefined || currentVal === "") {
    return {
      currentDisplay: "Not recorded",
      prevDisplay: prevVal !== null && prevVal !== undefined && prevVal !== "" ? `${prevVal}${unit ? " " + unit : ""}` : "Not recorded",
      diff: null,
      diffDisplay: "Previous comparison unavailable",
      pctDisplay: null,
      trend: "none",
      trendText: "Not recorded",
      hasData: false,
      hasComparison: false
    };
  }

  const currentNum = Number(currentVal);
  const currentDisplay = `${currentNum.toLocaleString()}${unit ? ` ${unit}` : ""}`;

  if (prevVal === null || prevVal === undefined || prevVal === "") {
    return {
      currentDisplay,
      prevDisplay: "Not recorded",
      diff: null,
      diffDisplay: "Previous comparison unavailable",
      pctDisplay: null,
      trend: "none",
      trendText: "None",
      hasData: true,
      hasComparison: false
    };
  }

  const prevNum = Number(prevVal);
  const prevDisplay = `${prevNum.toLocaleString()}${unit ? ` ${unit}` : ""}`;
  const diff = currentNum - prevNum;
  const pct = prevNum > 0 ? (diff / prevNum) * 100 : null;

  let trend = "stable";
  let trendText = "Steady";
  if (Math.abs(diff) < 0.01) {
    trend = "stable";
    trendText = "Steady";
  } else if (diff > 0) {
    trend = isHigherBetter ? "improving" : "declining";
    trendText = "Increased";
  } else {
    trend = isHigherBetter ? "declining" : "improving";
    trendText = "Decreased";
  }

  const diffSign = diff > 0 ? "+" : "";
  const formattedDiff = typeof diff === "number" && !Number.isInteger(diff) ? diff.toFixed(1) : diff;
  const diffDisplay = `${diffSign}${formattedDiff}${unit ? ` ${unit}` : ""}`;
  const pctDisplay = pct !== null ? `${diffSign}${pct.toFixed(1)}%` : null;

  return {
    currentDisplay,
    prevDisplay,
    diff,
    diffDisplay,
    pctDisplay,
    trend,
    trendText,
    hasData: true,
    hasComparison: true
  };
}

/**
 * Calculates deterministic FIS for a specific single check-in day
 * following the exact backend FIS weighting.
 */
function calculateDayFis(record, profileBmi) {
  if (!record) return null;

  const readMetric = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const steps = readMetric(record.steps);
  const exerciseMins = readMetric(record.exerciseMinutes);
  const sleep = readMetric(record.sleepHours);
  const water = readMetric(record.waterIntake);
  const bmi = readMetric(profileBmi);

  if ([steps, exerciseMins, sleep, water, bmi].some((value) => value === null)) {
    return null;
  }

  let stepScore = 20;
  if (steps >= 10000) stepScore = 100;
  else if (steps >= 7500) stepScore = 80;
  else if (steps >= 5000) stepScore = 60;
  else if (steps >= 3000) stepScore = 40;

  const workout = Boolean(record.workoutCompleted);
  let exerciseScore = 20;
  if (workout || exerciseMins >= 60) exerciseScore = 100;
  else if (exerciseMins >= 45) exerciseScore = 80;
  else if (exerciseMins >= 30) exerciseScore = 60;
  else if (exerciseMins >= 20) exerciseScore = 40;

  const activityScore = stepScore * 0.6 + exerciseScore * 0.4;

  let sleepScore = 20;
  if (sleep >= 7 && sleep <= 9) sleepScore = 100;
  else if (sleep >= 6) sleepScore = 75;
  else if (sleep >= 5) sleepScore = 50;
  else if (sleep > 9) sleepScore = 70;

  let waterScore = 30;
  if (water >= 2.5) waterScore = 100;
  else if (water >= 2.0) waterScore = 85;
  else if (water >= 1.5) waterScore = 70;
  else if (water >= 1.0) waterScore = 50;

  let bmiScore = 70;
  if (bmi >= 18.5 && bmi <= 24.9) bmiScore = 100;
  else if (bmi >= 25 && bmi < 30) bmiScore = 75;
  else bmiScore = 50;

  const dayFis = Math.round(
    activityScore * 0.35 + sleepScore * 0.25 + waterScore * 0.2 + bmiScore * 0.2
  );
  return Math.min(100, Math.max(10, dayFis));
}

export default function Analytics({
  profile,
  trackingRecords = [],
  fisResult,
  behaviorResult,
  predictionResult,
  consistencyPrediction,
  cohortResult,
  anomalyResult,
  nutritionData,
  streak = 0,
  bestStreak = 0
}) {
  const [timeFilter, setTimeFilter] = useState(7); // 7, 30, or 90
  const [, setLastRefresh] = useState(Date.now());

  // Listen for real-time check-in updates
  useEffect(() => {
    const handleUpdate = () => {
      setLastRefresh(Date.now());
    };
    window.addEventListener("dailyTrackingUpdated", handleUpdate);
    return () => {
      window.removeEventListener("dailyTrackingUpdated", handleUpdate);
    };
  }, []);

  // 1. Audit and clean valid check-in records from Firestore
  const allCheckIns = useMemo(() => {
    if (!Array.isArray(trackingRecords) || trackingRecords.length === 0) return [];

    return trackingRecords
      .filter((r) => {
        if (!r || typeof r !== "object") return false;
        if (r.checkInCompleted === true || r.dailyCheckInCompleted === true || r.recordedAt || r.completedAt) return true;
        const hasSteps = r.steps !== undefined && r.steps !== null && r.steps !== "";
        const hasSleep = r.sleepHours !== undefined && r.sleepHours !== null && r.sleepHours !== "";
        const hasWater = r.waterIntake !== undefined && r.waterIntake !== null && r.waterIntake !== "";
        const hasCalories =
          (r.caloriesConsumed !== undefined && r.caloriesConsumed !== null && r.caloriesConsumed !== "") ||
          (r.calories !== undefined && r.calories !== null && r.calories !== "");
        return Boolean(hasSteps && (hasSleep || hasWater || hasCalories));
      })
      .map((r) => {
        const rawDate = r.date || r.id;
        const calories =
          r.caloriesConsumed !== undefined && r.caloriesConsumed !== null && r.caloriesConsumed !== ""
            ? Number(r.caloriesConsumed)
            : r.calories !== undefined && r.calories !== null && r.calories !== ""
            ? Number(r.calories)
            : null;

        return {
          ...r,
          date: rawDate,
          steps: r.steps != null && r.steps !== "" ? Number(r.steps) : null,
          sleepHours: r.sleepHours != null && r.sleepHours !== "" ? Number(r.sleepHours) : null,
          waterIntake: r.waterIntake != null && r.waterIntake !== "" ? Number(r.waterIntake) : null,
          exerciseMinutes:
            r.exerciseMinutes != null && r.exerciseMinutes !== ""
              ? Number(r.exerciseMinutes)
              : r.durationMinutes != null && r.durationMinutes !== ""
              ? Number(r.durationMinutes)
              : null,
          caloriesConsumed: calories,
          protein: r.protein != null && r.protein !== "" ? Number(r.protein) : null,
          carbs: r.carbs != null && r.carbs !== "" ? Number(r.carbs) : null,
          fats: r.fats != null && r.fats !== "" ? Number(r.fats) : null,
          sleepQuality: r.sleepQuality || null,
          workoutCompleted: Boolean(r.workoutCompleted)
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Chronological
  }, [trackingRecords]);

  // 2. Filter check-ins based on viewing window
  const filteredCheckIns = useMemo(() => {
    if (allCheckIns.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (timeFilter - 1));
    cutoff.setHours(0, 0, 0, 0);

    return allCheckIns.filter((record) => {
      const recDate = parseLocalDate(record.date);
      recDate.setHours(0, 0, 0, 0);
      return recDate >= cutoff;
    });
  }, [allCheckIns, timeFilter]);

  // Count distinct actual check-in days
  const actualDaysCount = useMemo(() => {
    const dates = new Set(filteredCheckIns.map((r) => r.date).filter(Boolean));
    return dates.size;
  }, [filteredCheckIns]);

  const totalCheckInsCount = allCheckIns.length;

  // 3. Dynamic Analysis Period Information (strictly based on actual check-in data)
  const periodInfo = useMemo(() => {
    if (actualDaysCount === 0) {
      return {
        title: "No Check-in Data",
        subtitle: "0 Check-ins Completed",
        stage: "no_data",
        badge: "No Data"
      };
    }
    if (actualDaysCount === 1) {
      return {
        title: "Your Current Baseline",
        subtitle: "1 Check-in Completed",
        stage: "baseline",
        badge: "Baseline Established"
      };
    }
    if (actualDaysCount === 2) {
      return {
        title: "Progress Comparison",
        subtitle: "2 Check-ins Completed",
        stage: "comparison",
        badge: "Progress Comparison"
      };
    }
    if (actualDaysCount < 7) {
      return {
        title: "Personal Trend",
        subtitle: `${actualDaysCount} Check-ins Completed`,
        stage: "personal_trend",
        badge: "Personal Trend"
      };
    }
    if (actualDaysCount < 30) {
      return {
        title: "7-Day Trend",
        subtitle: `${actualDaysCount} Days of Check-in History`,
        stage: "seven_day_trend",
        badge: "7-Day Trend"
      };
    }
    return {
      title: "30-Day Trend",
      subtitle: `${actualDaysCount} Days of Check-in History`,
      stage: "thirty_day_trend",
      badge: "30-Day Trend"
    };
  }, [actualDaysCount]);

  // 4. Current vs Previous Check-in Records
  const latestRecord = filteredCheckIns[filteredCheckIns.length - 1] || allCheckIns[allCheckIns.length - 1];
  const previousRecord = actualDaysCount >= 2 ? filteredCheckIns[filteredCheckIns.length - 2] : null;

  const currentRecord = latestRecord;

  let comparisonLabel = "";
  if (actualDaysCount === 1) {
    comparisonLabel = `Baseline (Recorded on ${formatLocalDate(currentRecord?.date)})`;
  } else if (actualDaysCount >= 2 && currentRecord && previousRecord) {
    comparisonLabel = `${formatLocalDate(currentRecord.date)} vs ${formatLocalDate(previousRecord.date)}`;
  } else {
    comparisonLabel = "Previous comparison unavailable";
  }

  // Comparisons for core metrics (only valid if 2+ check-ins exist)
  const stepsComparison = compareMetric(
    currentRecord?.steps,
    actualDaysCount >= 2 ? previousRecord?.steps : null,
    "steps",
    true
  );
  const sleepComparison = compareMetric(
    currentRecord?.sleepHours,
    actualDaysCount >= 2 ? previousRecord?.sleepHours : null,
    "hrs",
    true
  );
  const waterComparison = compareMetric(
    currentRecord?.waterIntake,
    actualDaysCount >= 2 ? previousRecord?.waterIntake : null,
    "L",
    true
  );
  const caloriesComparison = compareMetric(
    currentRecord?.caloriesConsumed,
    actualDaysCount >= 2 ? previousRecord?.caloriesConsumed : null,
    "kcal",
    false
  );

  // 5. Multi-day averages (ONLY computed if 7+ actual check-in days exist)
  const periodAverages = useMemo(() => {
    if (actualDaysCount < 7) {
      return { steps: null, sleep: null, water: null, calories: null };
    }

    const validSteps = filteredCheckIns.map((r) => r.steps).filter((s) => s != null);
    const validSleep = filteredCheckIns.map((r) => r.sleepHours).filter((s) => s != null);
    const validWater = filteredCheckIns.map((r) => r.waterIntake).filter((w) => w != null);
    const validCalories = filteredCheckIns.map((r) => r.caloriesConsumed).filter((c) => c != null);

    return {
      steps: validSteps.length > 0 ? Math.round(validSteps.reduce((a, b) => a + b, 0) / validSteps.length) : null,
      sleep: validSleep.length > 0 ? (validSleep.reduce((a, b) => a + b, 0) / validSleep.length).toFixed(1) : null,
      water: validWater.length > 0 ? (validWater.reduce((a, b) => a + b, 0) / validWater.length).toFixed(1) : null,
      calories: validCalories.length > 0 ? Math.round(validCalories.reduce((a, b) => a + b, 0) / validCalories.length) : null
    };
  }, [filteredCheckIns, actualDaysCount]);

  // 6. Historical FIS Trend Points across all filtered check-ins
  const fisTrendData = useMemo(() => {
    const profileBmi = profile?.bodyAnalysis?.bmi ?? profile?.bmi ?? null;
    return filteredCheckIns.map((record) => {
      const dayFis = calculateDayFis(record, profileBmi);
      return {
        date: record.date,
        fis: dayFis,
        steps: record.steps,
        sleep: record.sleepHours
      };
    }).filter((record) => record.fis !== null);
  }, [filteredCheckIns, profile]);

  const currentFis = fisResult?.fis ?? (fisTrendData.length > 0 ? fisTrendData[fisTrendData.length - 1].fis : null);
  const previousFis = actualDaysCount >= 2 && fisTrendData.length >= 2 ? fisTrendData[fisTrendData.length - 2].fis : null;
  const fisDiff = currentFis != null && previousFis != null ? currentFis - previousFis : null;

  const displayStreak = streak || profile?.streak || 0;

  // ==========================================================
  // CASE 1: 0 CHECK-INS TOTAL
  // ==========================================================
  if (totalCheckInsCount === 0) {
    return (
      <div className="analytics-container max-w-5xl mx-auto pb-20 pt-4">
        <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-3xl">
            📊
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No check-in data yet</h2>
          <p className="text-slate-600 max-w-md mx-auto mb-6">
            Complete your first Daily Check-in to start building your personal baseline.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
            <Sparkles size={14} className="text-emerald-500" />
            Insights activate immediately with your very first check-in
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-container max-w-5xl mx-auto pb-24 font-sans text-slate-800">
      {/* ========================================================
          1. HEADER & DYNAMIC PERIOD INDICATOR
         ======================================================== */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Analytics</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Sparkles size={12} />
              {periodInfo.badge}
            </span>
          </div>
          <p className="text-slate-500 text-sm md:text-base">
            Continuous health intelligence generated from your actual daily check-in records.
          </p>
        </div>

        {/* Data-Aware View Window Filters */}
        <div className="flex flex-col items-start md:items-end gap-1.5">
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 shadow-inner">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setTimeFilter(days)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeFilter === days
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {days === 90 ? "3-Month View" : `${days}-Day View`}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            {timeFilter === 90 ? "3-Month" : `${timeFilter}-Day`} View • {actualDaysCount} check-in{actualDaysCount === 1 ? "" : "s"} available
          </span>
        </div>
      </div>

      {/* FILTER NOTICE (If selected window has 0 records, but earlier records exist) */}
      {actualDaysCount === 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm">
              No check-ins found in the last {timeFilter === 90 ? "3 months" : `${timeFilter} days`}. You have{" "}
              <strong>{totalCheckInsCount} earlier check-in(s)</strong> in your history.
            </p>
          </div>
          <button
            onClick={() => setTimeFilter(90)}
            className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-800 hover:bg-amber-100 shadow-xs"
          >
            View 3-Month Window
          </button>
        </div>
      )}

      {/* ========================================================
          2. CORE METRICS QUICK BAR (BASELINE VS COMPARISON)
         ======================================================== */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-emerald-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              {comparisonLabel}
            </h2>
          </div>
          {currentRecord?.date && (
            <span className="text-xs text-slate-400 font-medium">
              Recorded: {formatLocalDate(currentRecord.date)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card: Steps */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs hover:border-slate-200 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold flex items-center gap-1.5">
                <Activity size={14} className="text-emerald-500" /> Steps
              </span>
              {actualDaysCount > 2 && stepsComparison.trend === "improving" && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp size={12} /> Increased
                </span>
              )}
              {actualDaysCount > 2 && stepsComparison.trend === "declining" && (
                <span className="text-[10px] font-bold text-rose-500 flex items-center gap-0.5">
                  <TrendingDown size={12} /> Decreased
                </span>
              )}
              {actualDaysCount === 1 && (
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Baseline
                </span>
              )}
            </div>

            {actualDaysCount === 2 ? (
              <div className="space-y-1 text-xs pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Current:</span>
                  <span className="font-bold text-slate-900">{stepsComparison.currentDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Previous:</span>
                  <span className="font-medium text-slate-700">{stepsComparison.prevDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Change:</span>
                  <span
                    className={`font-bold ${
                      stepsComparison.diff >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {stepsComparison.diffDisplay}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-400">Trend:</span>
                  <span
                    className={`font-bold flex items-center gap-0.5 ${
                      stepsComparison.trend === "improving"
                        ? "text-emerald-600"
                        : stepsComparison.trend === "declining"
                        ? "text-rose-600"
                        : "text-slate-600"
                    }`}
                  >
                    {stepsComparison.trend === "improving" && <TrendingUp size={12} />}
                    {stepsComparison.trend === "declining" && <TrendingDown size={12} />}
                    {stepsComparison.trendText}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-900 mb-1">
                  {stepsComparison.currentDisplay}
                </div>
                <div className="text-xs text-slate-500">
                  {actualDaysCount > 2 && stepsComparison.hasComparison ? (
                    <span>
                      Prev: <strong className="text-slate-700">{stepsComparison.prevDisplay}</strong>{" "}
                      <span
                        className={
                          stepsComparison.diff >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"
                        }
                      >
                        ({stepsComparison.diffDisplay})
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      {actualDaysCount === 1 ? "Baseline value" : "Previous comparison unavailable"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Card: Sleep */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs hover:border-slate-200 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold flex items-center gap-1.5">
                <Moon size={14} className="text-indigo-500" /> Sleep
              </span>
              {actualDaysCount > 2 && sleepComparison.trend === "improving" && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp size={12} /> Increased
                </span>
              )}
              {actualDaysCount > 2 && sleepComparison.trend === "declining" && (
                <span className="text-[10px] font-bold text-rose-500 flex items-center gap-0.5">
                  <TrendingDown size={12} /> Decreased
                </span>
              )}
              {actualDaysCount === 1 && (
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Baseline
                </span>
              )}
            </div>

            {actualDaysCount === 2 ? (
              <div className="space-y-1 text-xs pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Current:</span>
                  <span className="font-bold text-slate-900">{sleepComparison.currentDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Previous:</span>
                  <span className="font-medium text-slate-700">{sleepComparison.prevDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Change:</span>
                  <span
                    className={`font-bold ${
                      sleepComparison.diff >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {sleepComparison.diffDisplay}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-400">Trend:</span>
                  <span
                    className={`font-bold flex items-center gap-0.5 ${
                      sleepComparison.trend === "improving"
                        ? "text-emerald-600"
                        : sleepComparison.trend === "declining"
                        ? "text-rose-600"
                        : "text-slate-600"
                    }`}
                  >
                    {sleepComparison.trend === "improving" && <TrendingUp size={12} />}
                    {sleepComparison.trend === "declining" && <TrendingDown size={12} />}
                    {sleepComparison.trendText}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-900 mb-1">
                  {sleepComparison.currentDisplay}
                </div>
                <div className="text-xs text-slate-500">
                  {actualDaysCount > 2 && sleepComparison.hasComparison ? (
                    <span>
                      Prev: <strong className="text-slate-700">{sleepComparison.prevDisplay}</strong>{" "}
                      <span
                        className={
                          sleepComparison.diff >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"
                        }
                      >
                        ({sleepComparison.diffDisplay})
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      {actualDaysCount === 1 ? "Baseline value" : "Previous comparison unavailable"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Card: Water */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs hover:border-slate-200 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold flex items-center gap-1.5">
                <Droplets size={14} className="text-blue-500" /> Hydration
              </span>
              {actualDaysCount > 2 && waterComparison.trend === "improving" && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp size={12} /> Increased
                </span>
              )}
              {actualDaysCount > 2 && waterComparison.trend === "declining" && (
                <span className="text-[10px] font-bold text-rose-500 flex items-center gap-0.5">
                  <TrendingDown size={12} /> Decreased
                </span>
              )}
              {actualDaysCount === 1 && (
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Baseline
                </span>
              )}
            </div>

            {actualDaysCount === 2 ? (
              <div className="space-y-1 text-xs pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Current:</span>
                  <span className="font-bold text-slate-900">{waterComparison.currentDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Previous:</span>
                  <span className="font-medium text-slate-700">{waterComparison.prevDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Change:</span>
                  <span
                    className={`font-bold ${
                      waterComparison.diff >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {waterComparison.diffDisplay}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-400">Trend:</span>
                  <span
                    className={`font-bold flex items-center gap-0.5 ${
                      waterComparison.trend === "improving"
                        ? "text-emerald-600"
                        : waterComparison.trend === "declining"
                        ? "text-rose-600"
                        : "text-slate-600"
                    }`}
                  >
                    {waterComparison.trend === "improving" && <TrendingUp size={12} />}
                    {waterComparison.trend === "declining" && <TrendingDown size={12} />}
                    {waterComparison.trendText}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-900 mb-1">
                  {waterComparison.currentDisplay}
                </div>
                <div className="text-xs text-slate-500">
                  {actualDaysCount > 2 && waterComparison.hasComparison ? (
                    <span>
                      Prev: <strong className="text-slate-700">{waterComparison.prevDisplay}</strong>{" "}
                      <span
                        className={
                          waterComparison.diff >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"
                        }
                      >
                        ({waterComparison.diffDisplay})
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      {actualDaysCount === 1 ? "Baseline value" : "Previous comparison unavailable"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Card: Calories */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs hover:border-slate-200 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold flex items-center gap-1.5">
                <Utensils size={14} className="text-amber-500" /> Calories
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Target: {nutritionData?.targets?.calorie_target != null
                  ? `${nutritionData.targets.calorie_target} kcal`
                  : "Not available"}
              </span>
            </div>

            {actualDaysCount === 2 ? (
              <div className="space-y-1 text-xs pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Current:</span>
                  <span className="font-bold text-slate-900">
                    {caloriesComparison.hasData ? caloriesComparison.currentDisplay : "Not recorded"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Previous:</span>
                  <span className="font-medium text-slate-700">
                    {caloriesComparison.hasComparison ? caloriesComparison.prevDisplay : "Not recorded"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Change:</span>
                  <span className="font-bold text-slate-700">
                    {caloriesComparison.hasComparison
                      ? caloriesComparison.diffDisplay
                      : "Previous comparison unavailable"}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-400">Trend:</span>
                  <span className="font-bold text-slate-600">
                    {caloriesComparison.hasComparison ? caloriesComparison.trendText : "None"}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-900 mb-1">
                  {caloriesComparison.hasData ? caloriesComparison.currentDisplay : "Not recorded"}
                </div>
                <div className="text-xs text-slate-500">
                  {actualDaysCount > 2 && caloriesComparison.hasComparison ? (
                    <span>
                      Prev: <strong className="text-slate-700">{caloriesComparison.prevDisplay}</strong>{" "}
                      <span className="text-slate-600 font-medium">({caloriesComparison.diffDisplay})</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      {actualDaysCount === 1
                        ? caloriesComparison.hasData
                          ? "Baseline value"
                          : "No calorie intake recorded"
                        : caloriesComparison.hasData
                        ? "Previous comparison unavailable"
                        : "No calorie intake recorded"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          3. FITNESS INTELLIGENCE SCORE (FIS) & CONSISTENCY ROW
         ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card: Fitness Intelligence Score */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <Target size={20} className="text-emerald-600" />
                <h3 className="text-lg font-black tracking-tight text-slate-900">
                  Fitness Intelligence Score (FIS)
                </h3>
              </div>
              {actualDaysCount >= 2 && fisDiff !== null && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    fisDiff >= 0
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {fisDiff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {fisDiff >= 0 ? `+${fisDiff.toFixed(1)}` : fisDiff.toFixed(1)} vs prev
                </span>
              )}
            </div>

            {/* Score Big Display */}
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
                {currentFis != null ? currentFis : "—"}
              </span>
              <span className="text-xl font-bold text-slate-400">/ 100</span>
              <span className="ml-auto text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-lg bg-slate-100 text-slate-700">
                {actualDaysCount === 1 ? "Baseline Score" : currentFis >= 80 ? "Optimal" : currentFis >= 60 ? "Solid Baseline" : "Building Momentum"}
              </span>
            </div>

            {/* FIS Visual Trend Line */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-1">
                <span>
                  {actualDaysCount === 1 ? "Baseline Score Point" : `Score Progression (${actualDaysCount} check-in${actualDaysCount === 1 ? "" : "s"})`}
                </span>
                <span className="text-slate-400 font-normal">Scale: 0 – 100</span>
              </div>
              <LineTrendChart
                data={fisTrendData}
                dataKey="fis"
                dateKey="date"
                target={80}
                targetLabel="Optimal Zone"
                unit="pts"
                color="emerald"
                height={150}
                minVal={20}
                maxVal={100}
                emptyMessage="Log check-ins to track FIS progression"
              />
            </div>

            {/* Component Scores Progress Bars */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Engine Component Breakdown
              </div>
              {[
                { label: "Activity", score: fisResult?.fitnessActivity?.score ?? null, color: "bg-emerald-500" },
                { label: "Recovery", score: fisResult?.recovery?.score ?? null, color: "bg-indigo-500" },
                { label: "Nutrition", score: fisResult?.nutrition?.score ?? null, color: "bg-amber-500" },
                {
                  label: "Consistency",
                  score: actualDaysCount < 3 ? null : fisResult?.consistency?.score ?? null,
                  color: "bg-blue-500",
                  note: actualDaysCount < 3 ? "Building baseline" : null
                }
              ].map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 w-24">{c.label}</span>
                  <div className="flex-1 mx-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${c.color}`}
                      style={{ width: `${c.score != null ? Math.min(100, c.score) : 0}%` }}
                    />
                  </div>
                  <span className="font-bold text-slate-800 w-28 text-right font-mono text-[11px]">
                    {c.note || c.score == null ? (
                      <span className="text-slate-400 font-normal">
                        {c.note || "Building baseline"}
                      </span>
                    ) : (
                      `${Math.round(c.score)} / 100`
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card: Consistency Analytics */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-blue-700 font-bold">
                <Calendar size={20} className="text-blue-600" />
                <h3 className="text-lg font-black tracking-tight text-slate-900">
                  Check-in Consistency
                </h3>
              </div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {actualDaysCount === 1 ? "Baseline Tracking" : `${actualDaysCount} Days Active`}
              </span>
            </div>

            {/* Streak & Consistency Metrics */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Recorded</p>
                <p className="text-2xl font-black text-slate-900">
                  {actualDaysCount}
                  <span className="text-xs text-slate-400 font-normal"> check-in{actualDaysCount === 1 ? "" : "s"}</span>
                </p>
              </div>

              <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-0.5">Status</p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {actualDaysCount >= 3 ? `${Math.round((actualDaysCount / timeFilter) * 100)}% active` : "Building baseline"}
                </p>
              </div>

              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">Current Streak</p>
                <p className="text-2xl font-black text-amber-900">
                  {displayStreak} <span className="text-xs font-normal">day{displayStreak === 1 ? "" : "s"}</span>
                </p>
              </div>
            </div>

            {/* Calendar Tracking Grid View */}
            <div className="mb-4">
              <CalendarTrackingMatrix daysCount={timeFilter} checkIns={filteredCheckIns} />
            </div>

            {/* Consistency Insight Message */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
              {actualDaysCount >= 3 ? (
                consistencyPrediction?.message ||
                `You have completed ${actualDaysCount} check-ins. Consistency builds habit permanence.`
              ) : (
                <span className="text-slate-500">
                  <strong>Building baseline:</strong> FitIQ has recorded {actualDaysCount} check-in. Complete 3 check-ins to unlock consistency forecasting.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. ACTIVITY ANALYTICS & SLEEP ANALYTICS ROW
         ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card: Activity Analytics */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-emerald-700 font-bold">
              <Activity size={20} className="text-emerald-600" />
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Activity Analytics
              </h3>
            </div>
            {actualDaysCount >= 7 && periodAverages.steps !== null && (
              <span className="text-xs font-semibold text-slate-500">
                {timeFilter}-day avg: <strong className="text-slate-800">{periodAverages.steps.toLocaleString()}</strong> steps
              </span>
            )}
            {actualDaysCount < 7 && (
              <span className="text-xs font-semibold text-slate-500">
                {actualDaysCount === 1 ? "Baseline" : `${actualDaysCount} check-ins`}
              </span>
            )}
          </div>

          {/* Daily Steps Trend Chart */}
          <div className="mb-4">
            <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-2">
              <span>{actualDaysCount === 1 ? "Baseline Steps" : "Daily Steps History"}</span>
              <span className="text-slate-400">Target: 10,000</span>
            </div>
            <LineTrendChart
              data={filteredCheckIns}
              dataKey="steps"
              dateKey="date"
              target={10000}
              targetLabel="10k Goal"
              unit="steps"
              color="emerald"
              height={180}
              emptyMessage="No step history for this time window"
            />
          </div>

          {/* Secondary Activity Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-400 font-medium block mb-1">Exercise Duration</span>
              <span className="text-base font-bold text-slate-900">
                {currentRecord?.exerciseMinutes != null
                  ? `${currentRecord.exerciseMinutes} mins`
                  : "Not recorded"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-400 font-medium block mb-1">Workout Status</span>
              <span className="text-base font-bold text-slate-900">
                {currentRecord?.workoutCompleted ? "✓ Completed" : "Rest / Untracked"}
              </span>
            </div>
          </div>

          {/* Explanation */}
          <p className="text-xs text-slate-600 mt-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100/60 leading-relaxed">
            {actualDaysCount === 1 ? (
              `You recorded ${stepsComparison.currentDisplay} on your first check-in. Complete more daily check-ins to unlock progress comparisons and trend tracking.`
            ) : stepsComparison.hasComparison ? (
              stepsComparison.diff > 0 ? (
                `Your activity increased by ${Math.abs(stepsComparison.diff).toLocaleString()} steps compared with your previous check-in.`
              ) : stepsComparison.diff < 0 ? (
                `Your activity decreased by ${Math.abs(stepsComparison.diff).toLocaleString()} steps compared with your previous check-in.`
              ) : (
                "Your activity remained completely steady compared with your previous check-in."
              )
            ) : (
              `Recorded ${stepsComparison.currentDisplay} on your latest check-in.`
            )}
          </p>
        </div>

        {/* Card: Sleep & Recovery Analytics */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <Moon size={20} className="text-indigo-600" />
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Sleep & Recovery Analytics
              </h3>
            </div>
            {actualDaysCount >= 7 && periodAverages.sleep !== null && (
              <span className="text-xs font-semibold text-slate-500">
                {timeFilter}-day avg: <strong className="text-slate-800">{periodAverages.sleep}</strong> hrs
              </span>
            )}
            {actualDaysCount < 7 && (
              <span className="text-xs font-semibold text-slate-500">
                {actualDaysCount === 1 ? "Baseline" : `${actualDaysCount} check-ins`}
              </span>
            )}
          </div>

          {/* Sleep Trend Bar Chart */}
          <div className="mb-4">
            <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-2">
              <span>{actualDaysCount === 1 ? "Baseline Sleep" : "Sleep Duration History"}</span>
              <span className="text-slate-400">Target: 7–8 hrs</span>
            </div>
            <BarTrendChart
              data={filteredCheckIns}
              dataKey="sleepHours"
              dateKey="date"
              target={7.5}
              targetLabel="Healthy Rest"
              unit="hrs"
              color="indigo"
              height={180}
              emptyMessage="No sleep records for this time window"
            />
          </div>

          {/* Secondary Sleep Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-400 font-medium block mb-1">Sleep Quality</span>
              <span className="text-base font-bold text-slate-900 capitalize">
                {currentRecord?.sleepQuality ? String(currentRecord.sleepQuality) : "Not recorded"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-400 font-medium block mb-1">Recovery Score</span>
              <span className="text-base font-bold text-slate-900">
                {fisResult?.recovery?.score != null
                  ? `${Math.round(fisResult.recovery.score)} / 100`
                  : "Building baseline"}
              </span>
            </div>
          </div>

          {/* Explanation */}
          <p className="text-xs text-slate-600 mt-3 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100/60 leading-relaxed">
            {actualDaysCount === 1 ? (
              `You recorded ${sleepComparison.currentDisplay} of sleep on your first check-in. Continue logging daily to build your recovery baseline.`
            ) : sleepComparison.hasComparison ? (
              sleepComparison.diff > 0 ? (
                `You slept ${Math.abs(sleepComparison.diff).toFixed(1)} hour(s) longer than your previous check-in, supporting muscle recovery.`
              ) : sleepComparison.diff < 0 ? (
                `Sleep duration decreased by ${Math.abs(sleepComparison.diff).toFixed(1)} hour(s) compared to your previous check-in.`
              ) : (
                "Your sleep duration was identical to your previous check-in."
              )
            ) : (
              `Recorded ${sleepComparison.currentDisplay} of sleep on your latest check-in.`
            )}
          </p>
        </div>
      </div>

      {/* ========================================================
          5. NUTRITION & HYDRATION ANALYTICS
         ======================================================== */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-amber-700 font-bold">
            <Utensils size={20} className="text-amber-600" />
            <h3 className="text-xl font-black tracking-tight text-slate-900">
              Nutrition & Hydration Analytics
            </h3>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {actualDaysCount === 1 ? "Baseline Intake" : "Target vs Consumed Tracking"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Calories & Macronutrients */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Energy & Macronutrient Targets
            </h4>

            {/* Calories Card */}
            <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-100 mb-4">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs font-bold text-slate-700">Daily Calories</span>
                <span className="text-xs text-slate-500">
                  Target: <strong>{nutritionData?.targets?.calorie_target != null
                    ? `${nutritionData.targets.calorie_target} kcal`
                    : "Not available"}</strong>
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-black text-slate-900">
                  {currentRecord?.caloriesConsumed != null
                    ? `${currentRecord.caloriesConsumed.toLocaleString()} kcal`
                    : "No calorie intake recorded"}
                </span>
                {currentRecord?.caloriesConsumed != null && (
                  <span className="text-xs text-slate-500">
                    {nutritionData?.targets?.calorie_target != null
                      ? `(${Math.round(
                          (currentRecord.caloriesConsumed / nutritionData.targets.calorie_target) * 100
                        )}% of target)`
                      : "(target unavailable)"}
                  </span>
                )}
              </div>

              <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      currentRecord?.caloriesConsumed != null && nutritionData?.targets?.calorie_target != null
                        ? Math.min(
                            100,
                            Math.round(
                                (currentRecord.caloriesConsumed / nutritionData.targets.calorie_target) *
                                100
                            )
                          )
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>

            {/* Macronutrient Bars */}
            <div className="space-y-3">
              <TargetProgressBar
                label="Protein"
                consumed={currentRecord?.protein}
                target={nutritionData?.macro_distribution?.protein_g || 110}
                unit="g"
                color="red"
              />
              <TargetProgressBar
                label="Carbohydrates"
                consumed={currentRecord?.carbs}
                target={nutritionData?.macro_distribution?.carbs_g || 200}
                unit="g"
                color="yellow"
              />
              <TargetProgressBar
                label="Fats"
                consumed={currentRecord?.fats}
                target={nutritionData?.macro_distribution?.fat_g || 55}
                unit="g"
                color="indigo"
              />
            </div>
          </div>

          {/* Right Column: Hydration (Water Trend) */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Water Intake {actualDaysCount === 1 ? "Baseline" : "Trend"} (Liters)
              </h4>
              <span className="text-xs text-slate-500 font-semibold">
                Target: {nutritionData?.targets?.water_liters || 2.5} L
              </span>
            </div>

            <LineTrendChart
              data={filteredCheckIns}
              dataKey="waterIntake"
              dateKey="date"
              target={Number(nutritionData?.targets?.water_liters) || 2.5}
              targetLabel="Hydration Target"
              unit="L"
              color="blue"
              height={190}
              emptyMessage="No water intake records for this period"
            />

            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100/60 text-xs text-slate-600 mt-4 leading-relaxed">
              {actualDaysCount === 1 ? (
                `Current baseline water intake is ${waterComparison.currentDisplay}.`
              ) : waterComparison.hasComparison ? (
                waterComparison.diff > 0 ? (
                  `Hydration increased by ${Math.abs(waterComparison.diff).toFixed(1)}L compared with your previous check-in.`
                ) : waterComparison.diff < 0 ? (
                  `Hydration dropped by ${Math.abs(waterComparison.diff).toFixed(1)}L compared with your previous check-in.`
                ) : (
                  "Hydration remained steady at your target."
                )
              ) : (
                `Latest recorded water intake is ${waterComparison.currentDisplay}.`
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          6. BEHAVIOR ANALYTICS & BODY PROGRESS ROW
         ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card: Behavior Analytics */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-purple-700 font-bold">
              <Users size={20} className="text-purple-600" />
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Habit Relationship Analytics
              </h3>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Activity vs Sleep
            </span>
          </div>

          <div className="mb-4">
            <DualHabitChart checkIns={filteredCheckIns} />
          </div>

          <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-100/70 text-xs text-purple-900 leading-relaxed">
            {actualDaysCount >= 2 ? (
              stepsComparison.diff > 0 && sleepComparison.diff > 0 ? (
                "On days when your recorded sleep was higher, your daily physical activity was also higher."
              ) : stepsComparison.diff < 0 && sleepComparison.diff < 0 ? (
                "Lower sleep duration was accompanied by lower recorded daily steps."
              ) : (
                "Your sleep and activity levels show varied independent patterns across your recorded check-ins."
              )
            ) : (
              "Log at least 2 check-ins to map your personalized habit relationship."
            )}
          </div>
        </div>

        {/* Card: Body Progress & Forecast */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-teal-700 font-bold">
              <Scale size={20} className="text-teal-600" />
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Body Progress & Forecast
              </h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              Predictive Engine
            </span>
          </div>

          {/* Current Measurements */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Current BMI</p>
              <p className="text-xl font-black text-slate-900">
                {profile?.bodyAnalysis?.bmi
                  ? Number(profile.bodyAnalysis.bmi).toFixed(1)
                  : predictionResult?.current_bmi
                  ? Number(predictionResult.current_bmi).toFixed(1)
                  : "—"}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Weight</p>
              <p className="text-xl font-black text-slate-900">
                {profile?.weight ? `${profile.weight} kg` : "—"}
              </p>
            </div>

            <div className="p-3 bg-teal-50/70 rounded-2xl border border-teal-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 mb-0.5">
                ✨ Predicted (7D)
              </p>
              <p className="text-xl font-black text-teal-900">
                {actualDaysCount < 2
                  ? "Building baseline"
                  : predictionResult?.predicted_future_bmi
                  ? Number(predictionResult.predicted_future_bmi).toFixed(2)
                  : predictionResult?.predicted_bmi_change != null
                  ? `${predictionResult.predicted_bmi_change > 0 ? "+" : ""}${Number(
                      predictionResult.predicted_bmi_change
                    ).toFixed(2)}`
                  : "Forecast unavailable"}
              </p>
            </div>
          </div>

          {/* 7-Day Forecast Explanation */}
          <div className="p-4 bg-teal-50/40 rounded-2xl border border-teal-100 text-xs text-slate-700 leading-relaxed mb-4">
            <div className="font-bold text-teal-900 mb-1 flex items-center gap-1.5">
              <Sparkles size={14} className="text-teal-600" />
              Machine Learning 7-Day Forecast
            </div>
            {actualDaysCount < 2 ? (
              <p>Log at least 2 check-ins to power your ML BMI progression forecast.</p>
            ) : predictionResult?.predicted_bmi_change != null &&
              Number.isFinite(Number(predictionResult.predicted_bmi_change)) ? (
              <p>
                Based on your daily steps, sleep, and hydration habits, your BMI is forecasted to{" "}
                <strong>
                  {predictionResult.predicted_bmi_change > 0.05
                    ? "trend slightly higher"
                    : predictionResult.predicted_bmi_change < -0.05
                    ? "trend slightly lower"
                    : "remain stable"}
                </strong>{" "}
                over the next week.
              </p>
            ) : (
              <p>Keep logging daily check-ins to power your ML BMI progression forecast.</p>
            )}
          </div>

          {/* SHAP Factors */}
          {predictionResult?.shap_factors && predictionResult.shap_factors.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Top Lifestyle Factors Influencing Your Forecast
              </span>
              <div className="flex flex-wrap gap-1.5">
                {predictionResult.shap_factors.slice(0, 3).map((factor, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium"
                  >
                    {factor.feature.replace(/_/g, " ")} ({factor.impact > 0 ? "+" : ""}{factor.impact.toFixed(2)})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          7. UNUSUAL CHANGES (ANOMALY) & SIMILAR USERS (COHORT) ROW
         ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card: Unusual Changes (Anomaly Detection) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-rose-600 font-bold">
              <AlertCircle size={20} className="text-rose-500" />
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Unusual Changes & Stability
              </h3>
            </div>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                actualDaysCount === 1
                  ? "bg-slate-100 text-slate-700"
                  : anomalyResult?.insight?.type === "negative"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : anomalyResult?.insight?.type === "positive"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {actualDaysCount === 1
                ? "Baseline"
                : actualDaysCount < 3
                ? "Building baseline"
                : anomalyResult?.status === "success"
                ? "Analysis available"
                : "Unavailable"}
            </span>
          </div>

          {/* Metric sequence preview */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 mb-3 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Recent Activity Sequence
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 font-mono text-slate-700">
              {filteredCheckIns.slice(-5).map((r, i) => (
                <React.Fragment key={i}>
                  <span
                    className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                      actualDaysCount >= 2 && i === filteredCheckIns.slice(-5).length - 1 && stepsComparison.diff < -1500
                        ? "bg-rose-100 text-rose-800"
                        : "bg-white border border-slate-200"
                    }`}
                  >
                    {r.steps != null ? r.steps.toLocaleString() : "Not recorded"}
                  </span>
                  {i < filteredCheckIns.slice(-5).length - 1 && <span className="text-slate-300">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
            {actualDaysCount === 1 ? (
              "Building baseline. Anomaly detection needs at least 3 check-ins to compare recent activity with your personal history."
            ) : anomalyResult?.insight?.message ? (
              anomalyResult.insight.message
            ) : (
              "Anomaly analysis is unavailable. Your recorded check-ins remain available."
            )}
          </div>
        </div>

        {/* Card: Similar Users (Cohort Analytics) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-cyan-700 font-bold">
              <Users size={20} className="text-cyan-600" />
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Similar Participants Comparison
              </h3>
            </div>
            {cohortResult?.average_similarity && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200">
                {Math.round(cohortResult.average_similarity)}% Match
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Benchmarked against anonymized real-world participants sharing similar age, BMI, and fitness baselines.
          </p>

          {/* Comparison Bars */}
          <div className="space-y-3">
            <CohortComparisonItem
              label="Daily Steps"
              userVal={currentRecord?.steps ?? null}
              cohortVal={cohortResult?.comparisons?.steps?.cohort ?? null}
              unit="steps"
              higherIsBetter={true}
            />
            <CohortComparisonItem
              label="Sleep Duration"
              userVal={currentRecord?.sleepHours ?? null}
              cohortVal={cohortResult?.comparisons?.sleep?.cohort ?? null}
              unit="hrs"
              higherIsBetter={true}
            />
            <CohortComparisonItem
              label="Water Intake"
              userVal={currentRecord?.waterIntake ?? null}
              cohortVal={cohortResult?.comparisons?.water?.cohort ?? null}
              unit="L"
              higherIsBetter={true}
            />
          </div>
        </div>
      </div>

      {/* ========================================================
          8. DYNAMIC OVERALL SUMMARY CARD
         ======================================================== */}
      <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block mb-1">
              {actualDaysCount === 1 ? "Baseline Summary" : "Holistic Overview"}
            </span>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {periodInfo.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              {periodInfo.subtitle}
            </span>
          </div>
        </div>

        {/* CASE 1 CHECK-IN: SHOW BASELINE STATS, NO FALSE IMPROVEMENT/DECLINE/STABLE PILLARS */}
        {actualDaysCount === 1 ? (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
                  <Activity size={14} /> Activity Baseline
                </span>
                <p className="text-xl font-bold text-white mb-1">
                  {currentRecord?.steps != null ? `${currentRecord.steps.toLocaleString()} steps` : "Not recorded"}
                </p>
                <p className="text-xs text-slate-400">First recorded activity baseline</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-2">
                  <Moon size={14} /> Sleep Baseline
                </span>
                <p className="text-xl font-bold text-white mb-1">
                  {currentRecord?.sleepHours != null ? `${currentRecord.sleepHours} hrs` : "Not recorded"}
                </p>
                <p className="text-xs text-slate-400">First recorded recovery baseline</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-2">
                  <Droplets size={14} /> Hydration Baseline
                </span>
                <p className="text-xl font-bold text-white mb-1">
                  {currentRecord?.waterIntake != null ? `${currentRecord.waterIntake} L` : "Not recorded"}
                </p>
                <p className="text-xs text-slate-400">First recorded hydration intake</p>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed">
              FitIQ has your first check-in and is building your personal baseline. Complete more check-ins to unlock comparisons, trends, and progress insights.
            </p>
          </div>
        ) : (
          /* CASE 2+ CHECK-INS: SHOW COMPARISON & TREND PILLARS */
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
                  <TrendingUp size={14} /> What Increased
                </span>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {stepsComparison.diff > 0
                    ? `Activity increased by +${stepsComparison.diff.toLocaleString()} steps.`
                    : waterComparison.diff > 0
                    ? `Hydration increased by +${waterComparison.diff.toFixed(1)}L.`
                    : sleepComparison.diff > 0
                    ? `Sleep duration expanded by +${sleepComparison.diff.toFixed(1)} hours.`
                    : "Baseline metrics are holding firm across your check-in records."}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-2">
                  <TrendingDown size={14} /> What Decreased
                </span>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {sleepComparison.diff < 0
                    ? `Sleep duration dropped by ${Math.abs(sleepComparison.diff).toFixed(1)} hrs.`
                    : stepsComparison.diff < 0
                    ? `Steps dropped by ${Math.abs(stepsComparison.diff).toLocaleString()} steps.`
                    : waterComparison.diff < 0
                    ? `Hydration decreased by ${Math.abs(waterComparison.diff).toFixed(1)}L.`
                    : "No significant declines detected between your check-ins."}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                  <Minus size={14} /> What Stayed Stable
                </span>
                <p className="text-sm text-slate-200 leading-relaxed">
                  BMI holds at {profile?.bodyAnalysis?.bmi ? Number(profile.bodyAnalysis.bmi).toFixed(1) : "baseline"}.
                  Check-in consistency remains steady.
                </p>
              </div>
            </div>

            <p className="text-slate-400 text-sm leading-relaxed">
              {actualDaysCount === 2 ? (
                `Comparing your 2 check-ins: Activity shifted by ${stepsComparison.diffDisplay || "0 steps"} and sleep changed by ${sleepComparison.diffDisplay || "0 hrs"}. Log your 3rd check-in to unlock multi-point personal trend charts.`
              ) : actualDaysCount < 7 ? (
                `Across your ${actualDaysCount} check-ins, your recorded movement and sleep are establishing your personal trend trajectory. Keep checking in to unlock 7-day trend analysis.`
              ) : (
                `Over this period with ${actualDaysCount} actual check-in days, your weekly movement averages ${periodAverages.steps?.toLocaleString() || "steady"} steps and ${periodAverages.sleep || "steady"} hours of sleep per day.`
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
