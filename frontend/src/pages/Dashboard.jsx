import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import DailyTracking from "./DailyTracking";
import Analytics from "./Analytics";
import { auth } from "../firebase/firebase";
import { prepareFisInput, calculateFis } from "../services/fisService";
import {
  getUserProfile,
  updateDailyGoals,
  updateTodayCompletion,
  getDailyTracking,
  getWeeklyTracking,
  getLast7DaysTracking,
  getStreakData,
  getLocalDateKey,
  isCheckInRecord,
  getLatestCheckInStatus
} from "../services/firestoreService";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../services/authService";
import Sidebar from "../components/Sidebar";
import ProfileSection, { getUserDisplayName } from "../components/ProfileSection";
import { analyzeBehavior } from "../services/behaviorService";
import { getPrediction } from "../services/predictionService";
import { getConsistencyPrediction } from "../services/consistencyPredictionService";
import { getCohortAnalysis } from "../services/cohortService";
import { getAnomalyAnalysis } from "../services/anomalyService";
import { getComprehensiveInterpretation } from "../services/interpretationService";
import { fetchBackend } from "../services/apiClient";
import MobileBottomNav from "../components/MobileBottomNav";

const getTodayDate = getLocalDateKey;
const DASHBOARD_PAGE_ROUTES = {
  dashboard: "/dashboard",
  insights: "/insights",
  analytics: "/analytics",
  nutrition: "/nutrition",
  tracking: "/tracking",
  profile: "/profile",
};
const DASHBOARD_ROUTE_PAGES = Object.fromEntries(
  Object.entries(DASHBOARD_PAGE_ROUTES).map(([page, route]) => [route, page])
);
const getDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPastDateKey = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return getDateKey(date);
};

const calculateGoalStreak = (history = {}) => {
  let streak = 0;
  let offset = history[getPastDateKey(0)]?.completed ? 0 : 1;

  while (history[getPastDateKey(offset)]?.completed) {
    streak += 1;
    offset += 1;
  }

  return streak;
};

const calculateBestStreak = (history = {}) => {
  const completedDates = Object.keys(history)
    .filter((date) => history[date]?.completed)
    .sort();

  if (!completedDates.length) return 0;

  let best = 1;
  let current = 1;

  for (let i = 1; i < completedDates.length; i += 1) {
    const previous = new Date(`${completedDates[i - 1]}T00:00:00`);
    const currentDate = new Date(`${completedDates[i]}T00:00:00`);
    const diff = Math.round((currentDate - previous) / 86400000);

    if (diff === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
};

const getActivityScore = (record) => {
  if (!record) return 0;

  const steps = Math.min(Number(record.steps) || 0, 10000) / 10000;
  const exercise = Math.min(Number(record.exerciseMinutes) || 0, 60) / 60;
  const sleep = Math.min(Number(record.sleepHours) || 0, 8) / 8;
  const water = Math.min(Number(record.waterIntake) || 0, 3) / 3;
  const workout = record.workoutCompleted ? 1 : 0;

  return Math.round(
    steps * 35 + exercise * 25 + sleep * 15 + water * 15 + workout * 10
  );
};

function Dashboard() {
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
const [trackingRecords, setTrackingRecords] = useState([]);
   // E6 Nutrition Intelligence
  const [nutritionData, setNutritionData] = useState(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionError, setNutritionError] = useState("");

  const [todayCompleted, setTodayCompleted] = useState(false);
  const [dailyTrackingRecorded, setDailyTrackingRecorded] = useState(false);
  const expirationTimerRef = useRef(null);
  const [trackingDays, setTrackingDays] = useState(0);
const [trackingConsistency, setTrackingConsistency] = useState(0);
const [last7DaysTracking, setLast7DaysTracking] = useState([]);
  const [goals, setGoals] = useState({
  water: false,
  workout: false,
  steps: false,
  sleep: false
});
const [fisResult, setFisResult] = useState(null);
const [behaviorResult, setBehaviorResult] = useState(null);
const [behaviorError, setBehaviorError] = useState(null);
const [analyticsError, setAnalyticsError] = useState(null);
const [predictionResult, setPredictionResult] = useState(null);
const [predictionLoading, setPredictionLoading] = useState(false);
const [predictionError, setPredictionError] = useState(null);
const [consistencyPrediction, setConsistencyPrediction] = useState(null);
const [, setConsistencyPredictionError] = useState(null);
const [cohortResult, setCohortResult] = useState(null);
const [cohortLoading, setCohortLoading] = useState(false);
const [cohortError, setCohortError] = useState(null);
const [anomalyResult, setAnomalyResult] = useState(null);
const [anomalyLoading, setAnomalyLoading] = useState(false);
const [anomalyError, setAnomalyError] = useState(null);
// Engine 7 — Comprehensive Interpretation
const [interpretationResult, setInterpretationResult] = useState(null);
const [interpretationLoading, setInterpretationLoading] = useState(false);
const [interpretationError, setInterpretationError] = useState(null);
const [techModeEnabled, setTechModeEnabled] = useState(false);
const toggleGoal = async (goal) => {
  const user = auth.currentUser;
  if (!user) return;

  const previousGoals = goals;

  const updatedGoals = {
    ...goals,
    [goal]: !goals[goal],
  };

  setGoals(updatedGoals);

  try {
    await updateDailyGoals(user.uid, updatedGoals);

    const completed = Object.values(updatedGoals).every(Boolean);
    setTodayCompleted(completed);

    // Recalculate streak from Firestore
    const streakData = await getStreakData(user.uid);

    setStreak(streakData.currentStreak);
    setBestStreak(streakData.bestStreak);

  } catch (error) {
    console.error("Unable to save daily goal:", error);

    setGoals(previousGoals);

    alert("Unable to save this goal. Please try again.");
  }
};

const loadNutritionData = async () => {
  const user = auth.currentUser;
  if (!user || !profile) return;

  try {
    setNutritionLoading(true);
    setNutritionError("");

    const records = await getWeeklyTracking(user.uid);
    const checkInStatus = await getLatestCheckInStatus(user.uid);
    const todayCheckin = checkInStatus.isTracked ? checkInStatus.latestRecord : null;

    const response = await fetchBackend(
      "/nutrition",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          age: Number(profile.age),
          gender: profile.gender,
          height_cm: Number(profile.height),
          weight_kg: Number(profile.weight),
          activity_level: profile.activityLevel || "moderate",
          goal: profile.goal || "maintenance",
          diet_type: profile.dietPreference || "mixed",
          today_checkin: todayCheckin,
          recent_history: records || [],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      throw new Error(
        data.message || "Unable to generate nutrition recommendations."
      );
    }

    console.log("E6 NUTRITION RESULT:", data);

    setNutritionData(data);
    setNutritionError("");

  } catch (error) {

    console.error("E6 Nutrition Error:", error);

    setNutritionError(
      error.message || "Unable to generate nutrition recommendations."
    );

  } finally {
    setNutritionLoading(false);
  }
};
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routePage = DASHBOARD_ROUTE_PAGES[pathname] || "dashboard";

  const [activePage, setActivePageState] = useState(routePage);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    setActivePageState(routePage);
  }, [routePage]);

  const setActivePage = (page) => {
    setActivePageState(page);
    navigate(DASHBOARD_PAGE_ROUTES[page] || "/dashboard");
  };

const healthScore = profile?.bodyAnalysis?.healthScore || 0;

  useEffect(() => {

  async function fetchProfile(user) {

    if (!user) {
      setProfileLoading(false);
      return;
    }

    try {
      setProfileLoading(true);
      setAnalyticsError(null);
      setBehaviorError(null);
      const data = await getUserProfile(user.uid);
      console.log("PROFILE DATA FROM FIRESTORE:", data);
      setProfile(data);
      setProfileLoading(false);
      if (!data) {
        return;
      }

      console.log(data);

    const checkInStatus = await getLatestCheckInStatus(user.uid);
    const trackingRecords = await getWeeklyTracking(user.uid);

    // STRICT 24-HOUR CYCLE: Check-in is active ONLY if completed within the last 24 hours
    const isCheckInActive = Boolean(checkInStatus.isTracked);
    setDailyTrackingRecorded(isCheckInActive);

    // Manage automatic expiration timer for the 24-hour cycle
    if (expirationTimerRef.current) {
      clearTimeout(expirationTimerRef.current);
      expirationTimerRef.current = null;
    }

    if (isCheckInActive && checkInStatus.remainingMs > 0) {
      console.log(`24h check-in active. Automatic expiration in ${Math.round(checkInStatus.remainingMs / 1000)}s`);
      expirationTimerRef.current = setTimeout(() => {
        console.log("24-hour check-in period expired! Automatically transitioning to 'Take Check-in'");
        setDailyTrackingRecorded(false);
        window.dispatchEvent(new Event("dailyTrackingExpired"));
        fetchProfile(auth.currentUser);
      }, checkInStatus.remainingMs + 500);
    }

    const trackingData = isCheckInActive ? checkInStatus.latestRecord : null;
    setTrackingRecords(trackingRecords);
    console.log("FIS TRACKING RECORDS:", trackingRecords);
    console.log("ACTIVE 24H CHECK-IN RECORD:", trackingData, "IS ACTIVE:", isCheckInActive);

    // Chronologically sort all valid check-in records to extract latest and previous check-ins
    const getRecordMillis = (r) => {
      if (!r) return 0;
      const raw = r.completedAt || r.recordedAt || r.completedAtMillis || r.createdAt || r.timestamp;
      if (raw?.toMillis) return raw.toMillis();
      if (typeof raw === "number") return raw;
      if (raw?.seconds) return raw.seconds * 1000;
      if (r.date) {
        const p = new Date(`${r.date}T00:00:00`).getTime();
        if (!isNaN(p)) return p;
      }
      return 0;
    };

    const validCheckIns = [...(trackingRecords || [])]
      .filter((r) => Boolean(r && (r.completedAt || r.recordedAt || r.completedAtMillis || r.date || r.steps != null)))
      .sort((a, b) => getRecordMillis(a) - getRecordMillis(b));

    const totalCheckinsCount = validCheckIns.length;
    const latestCheckinDoc = totalCheckinsCount > 0 ? validCheckIns[totalCheckinsCount - 1] : (checkInStatus.latestRecord || null);
    const previousCheckinDoc = totalCheckinsCount > 1 ? validCheckIns[totalCheckinsCount - 2] : null;
    const isFirstCheckin = totalCheckinsCount <= 1;
    const recCacheKey = `${user.uid}_${checkInStatus.completedAtMillis || getRecordMillis(latestCheckinDoc) || Date.now()}`;

    // E6 Nutrition Intelligence
    let nutritionSnap = null;
    try {
      setNutritionLoading(true);
      setNutritionError("");

      const nutritionInput = {
        age: Number(data.age),
        gender: data.gender,
        height_cm: Number(data.height),
        weight_kg: Number(data.weight),
        activity_level: data.activityLevel || "moderate",
        goal: data.goal || "maintenance",
        diet_type: data.dietPreference || "mixed",
        today_checkin: trackingData,
        recent_history: trackingRecords || [],
      };

      console.log("E6 NUTRITION INPUT:", nutritionInput);

      const nutritionResponse = await fetchBackend(
        "/nutrition",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(nutritionInput),
        }
      );

      const nutritionResult = await nutritionResponse.json();

      if (!nutritionResponse.ok || nutritionResult.status !== "success") {
        throw new Error(
          nutritionResult.message ||
          "Unable to generate nutrition recommendations."
        );
      }

      console.log(
        "E6 NUTRITION RESULT:",
        nutritionResult
      );

      nutritionSnap = nutritionResult;
      setNutritionData(nutritionResult);
      setNutritionError("");

    } catch (error) {

      console.error(
        "E6 Nutrition analysis failed:",
        error
      );

      setNutritionError(
        error.message ||
        "Unable to generate nutrition recommendations."
      );

    } finally {

      setNutritionLoading(false);

    }

    let behaviorData = null;
    try {
      behaviorData = await analyzeBehavior(trackingRecords);
      console.log("BEHAVIOR RESULT:", behaviorData);
      setBehaviorResult(behaviorData);
      setBehaviorError(null);
    } catch (error) {
      console.error("Behavior analytics failed:", error);
      setBehaviorResult(null);
      setBehaviorError(
        error.message || "Behavior analytics are temporarily unavailable."
      );
    }
// Local refs to capture engine results for E7 interpretation
// (React setState is async and won't reflect in the same execution frame)
let _predictionData = null;
let _consistencyData = null;
let _cohortData = null;
let _anomalyData = null;

// ================= E3 PREDICTIVE ANALYTICS =================

try {
  setPredictionLoading(true);
  setPredictionError(null);

 /* const validTracking = trackingRecords.filter(
    record =>
      record.steps != null ||
      record.dailySteps != null
  );*/

  const average = (values) => {
    const validValues = values.filter(
      value => value != null && !isNaN(Number(value))
    );

    if (validValues.length === 0) return 0;

    return (
      validValues.reduce(
        (sum, value) => sum + Number(value),
        0
      ) / validValues.length
    );
  };

  const dailySteps = average(
    trackingRecords.map(record =>
      record.steps ?? record.dailySteps
    )
  );

  const durationMinutes = average(
    trackingRecords.map(record =>
      record.exerciseMinutes ?? record.duration_minutes
    )
  );

  const hoursSleep = average(
    trackingRecords.map(record =>
      record.sleep ?? record.sleepHours ?? record.hours_sleep
    )
  );

  const hydrationLevel = average(
    trackingRecords.map(record =>
      record.water ?? record.waterIntake ?? record.hydration_level
    )
  );

  const stressLevel = average(
    trackingRecords.map(record =>
      record.stress ?? record.stressLevel ?? record.stress_level
    )
  );

  const predictionInput = {
    age: Number(data.age),
    height_cm: Number(data.height),
    weight_kg: Number(data.weight),
    fitiq_bmi: Number(data.bodyAnalysis?.bmi),

    daily_steps: dailySteps,
    duration_minutes: durationMinutes,
    hours_sleep: hoursSleep,
    hydration_level: hydrationLevel,
    stress_level: stressLevel
  };

  console.log("E3 PREDICTION INPUT:", predictionInput);

  const predictionData = await getPrediction(
    predictionInput
  );

  console.log("E3 PREDICTION RESULT:", predictionData);

  _predictionData = predictionData;
  setPredictionResult(predictionData);
  const consistencyData = await getConsistencyPrediction(
  trackingRecords
);

console.log(
  "E3 CONSISTENCY FORECAST:",
  consistencyData
);

_consistencyData = consistencyData;
setConsistencyPrediction(consistencyData);

const cohortInput = {
  age: Number(data.age),
  gender: data.gender,
  bmi: Number(data.bodyAnalysis?.bmi),
  activity_level: data.activityLevel,
  exercise_days: Number(data.exerciseFrequency),
  fitness_goal: data.goal,

  daily_steps: dailySteps,
  sleep: hoursSleep,
  water: hydrationLevel,

  consistency:
    consistencyData?.current_score ?? null
};

console.log(
  "E4 COHORT INPUT:",
  cohortInput
);

setCohortLoading(true);

const cohortData = await getCohortAnalysis(
  cohortInput
);

console.log(
  "E4 COHORT RESULT:",
  cohortData
);

_cohortData = cohortData;
setCohortResult(cohortData);
setCohortLoading(false);
setCohortError(null);
} catch (error) {
  console.error("Analytics prediction failed:", error);

  setPredictionError(
    error.message || "Unable to generate prediction"
  );

  setConsistencyPredictionError(
    error.message || "Unable to generate consistency forecast"
  );

  setCohortError(
    error.message || "Unable to generate cohort analysis"
  );

  setCohortLoading(false);
}finally {

  setPredictionLoading(false);

}

// ================= E5 ANOMALY & ACTIVITY PATTERNS =================

try {
  setAnomalyLoading(true);
  setAnomalyError(null);

  const anomalyData = await getAnomalyAnalysis(
  trackingRecords
);

  console.log("E5 ANOMALY RESULT:", anomalyData);

  _anomalyData = anomalyData;
  setAnomalyResult(anomalyData);
} catch (error) {
  console.error("E5 anomaly analysis failed:", error);

  setAnomalyError(
    error.message || "Unable to generate anomaly analysis"
  );
} finally {
  setAnomalyLoading(false);
}

const fisInput = prepareFisInput(data, trackingRecords);
console.log("FIS INPUT:", fisInput);
const fisData = await calculateFis(fisInput);

console.log("FIS RESULT:", fisData);

setFisResult(fisData);

// ================= E7 COMPREHENSIVE INTERPRETATION =================
try {
  setInterpretationLoading(true);
  setInterpretationError(null);

  if (nutritionSnap && nutritionSnap.status === "success") {
    setNutritionData(nutritionSnap);
    setNutritionError("");
  }

  const activeCheckin = trackingData || latestCheckinDoc;
  if (activeCheckin || totalCheckinsCount > 0) {
    const interpretData = await getComprehensiveInterpretation({
      profile: data,
      fisResult: fisData,
      behaviorResult: behaviorData,
      predictionResult: _predictionData,
      consistencyPrediction: _consistencyData,
      cohortResult: _cohortData,
      anomalyResult: _anomalyData,
      nutritionData: nutritionSnap,
      today_checkin: activeCheckin,
      latest_checkin: activeCheckin,
      previous_checkin: previousCheckinDoc,
      checkin_count: totalCheckinsCount,
      is_first_checkin: isFirstCheckin,
      recent_history: validCheckIns,
      cache_key: recCacheKey,
    });
    console.log("E7 INTERPRETATION RESULT:", interpretData);
    setInterpretationResult(interpretData);
  } else {
    setInterpretationResult(null);
  }
} catch (e7err) {
  console.error("E7 Interpretation failed:", e7err);
  setInterpretationError(
    e7err.message || "Personalized explanation is temporarily unavailable."
  );
} finally {
  setInterpretationLoading(false);
}
const last7Days = await getLast7DaysTracking(user.uid);

setLast7DaysTracking(last7Days);
// Calculate last 7 days
const currentDate = new Date();

const lastSevenDays = [];

for (let i = 0; i < 7; i++) {

  const date = new Date(currentDate);

  date.setDate(currentDate.getDate() - i);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  lastSevenDays.push(`${year}-${month}-${day}`);
}

const recordedDays = trackingRecords.filter(record =>
  lastSevenDays.includes(record.date)
).length;

setTrackingDays(recordedDays);

setTrackingConsistency(
  Math.round((recordedDays / 7) * 100)
);

const today = getTodayDate();

    const defaultGoals = {
      water: false,
      workout: false,
      steps: false,
      sleep: false
    };

    if (data.goalDate === today) {
      setGoals(data.dailyGoals || defaultGoals);
      setTodayCompleted(Boolean(data.todayCompleted));
    } else {
      setGoals(defaultGoals);
      setTodayCompleted(false);
      await updateDailyGoals(user.uid, defaultGoals);
      const streakData = await getStreakData(user.uid);

setStreak(streakData.currentStreak);
setBestStreak(streakData.bestStreak);
    }

    const streakData = await getStreakData(user.uid);

    setStreak(streakData.currentStreak);
    setBestStreak(streakData.bestStreak);
  } catch (profileErr) {
    console.error("fetchProfile error:", profileErr);
    setAnalyticsError(
      profileErr.message ||
        "Unable to load dashboard analytics. Please try again."
    );
    setInterpretationLoading(false);
  } finally {
    setProfileLoading(false);
  }
  }

  const unsubscribeAuth = onAuthStateChanged(auth, async (resolvedUser) => {
    setAuthUser(resolvedUser);
    if (resolvedUser) {
      await fetchProfile(resolvedUser);
    } else {
      setProfileLoading(false);
    }
  });
const handleTrackingUpdate = () => {
  fetchProfile(auth.currentUser);
};

const handleProfileUpdate = (e) => {
  if (e?.detail) {
    setProfile((prev) => ({ ...prev, ...e.detail }));
  } else {
    fetchProfile(auth.currentUser);
  }
};

window.addEventListener(
  "dailyTrackingUpdated",
  handleTrackingUpdate
);

window.addEventListener(
  "dailyTrackingExpired",
  handleTrackingUpdate
);

window.addEventListener(
  "profileUpdated",
  handleProfileUpdate
);

return () => {
  unsubscribeAuth();
  window.removeEventListener(
    "dailyTrackingUpdated",
    handleTrackingUpdate
  );
  window.removeEventListener(
    "dailyTrackingExpired",
    handleTrackingUpdate
  );
  window.removeEventListener(
    "profileUpdated",
    handleProfileUpdate
  );
  if (expirationTimerRef.current) {
    clearTimeout(expirationTimerRef.current);
  }
};
}, []);

useEffect(() => {
  if (activePage === "nutrition" && !nutritionData && !nutritionLoading && profile) {
    loadNutritionData();
  }
}, [activePage, nutritionData, nutritionLoading, profile]);
 
  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      alert(error.message);
    }
  };

  // Determine personalized greeting from authenticated profile
  const userDisplayName = getUserDisplayName(profile, authUser);
  const hasCompletedAssessment = Boolean(
    profile?.healthAssessmentCompleted === true ||
    (profile?.healthAssessment && typeof profile.healthAssessment === "object" && Object.keys(profile.healthAssessment).length > 0) ||
    profile?.assessmentCompletedAt ||
    profile?.initialAssessmentCompleted ||
    (profile?.bodyAnalysis && profile?.bodyAnalysis?.healthScore != null)
  );
  const isFirstTime = !hasCompletedAssessment;

  const greetingTitle = isFirstTime
    ? (userDisplayName ? `Welcome, ${userDisplayName} 👋` : "Welcome 👋")
    : (userDisplayName ? `Welcome back, ${userDisplayName} 👋` : "Welcome back 👋");

  const greetingSubtitle = isFirstTime
    ? "Let's get started on your fitness journey."
    : "See your progress, understand your trends, and know what to focus on today.";

  return (
  <div className="min-h-screen bg-background flex">

    {/* Desktop sidebar — hidden on mobile via .desktop-sidebar CSS class */}
    <div className="desktop-sidebar">
      <Sidebar setActivePage={setActivePage} activePage={activePage} profile={profile} user={authUser} />
    </div>

    {/* Main content — mobile-content-wrapper adds bottom padding for nav bar */}
    <div className="flex-1 p-8 md:p-8 p-4 mobile-content-wrapper overflow-x-hidden">
{activePage !== "profile" && (
  <button
    onClick={handleLogout}
    className="bg-primary text-white px-6 py-2 rounded-xl font-semibold hover:bg-orange-700 transition"
  >
    Logout
  </button>
)}
  <div className={activePage === "profile" ? "mt-4" : "mt-20 text-center"}>

  {activePage === "dashboard" && (
    <>
      <div className="max-w-7xl mx-auto text-left">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">
              E7 • Fitness Intelligence Dashboard
            </p>
            {profileLoading ? (
              <div className="mt-2 space-y-2 animate-pulse">
                <div className="h-10 w-64 md:w-80 bg-gray-200 rounded-xl"></div>
                <div className="h-5 w-80 md:w-96 bg-gray-100 rounded-lg"></div>
              </div>
            ) : (
              <>
                <h1 className="text-4xl md:text-5xl font-heading font-bold text-textPrimary mt-2">
                  {greetingTitle}
                </h1>
                <p className="text-base md:text-lg text-textSecondary mt-2">
                  {greetingSubtitle}
                </p>
              </>
            )}
          </div>

          {!dailyTrackingRecorded ? (
            <button
              onClick={() => setActivePage("tracking")}
              className="self-start lg:self-auto bg-primary text-white px-5 py-3 rounded-xl font-semibold hover:bg-orange-700 transition shadow-sm"
            >
              Take Check-in
            </button>
          ) : (
            <div className="self-start lg:self-auto bg-green-100 text-green-800 px-5 py-3 rounded-xl font-semibold shadow-sm flex items-center gap-2 border border-green-200 cursor-default">
              ✓ Daily Check-in Tracked
            </div>
          )}
        </div>

        {profile && (
          <>
            {/* Snapshot */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              <div className="bg-white rounded-2xl shadow-card p-5 border border-orange-50">
                <p className="text-sm text-textSecondary">Fitness Score</p>
                <p className="text-3xl font-bold text-primary mt-2">
                  {fisResult?.fis ?? "—"}<span className="text-base text-gray-400">/100</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">E1 FIS</p>
              </div>

              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-sm text-textSecondary">Weekly Tracking</p>
                <p className="text-3xl font-bold text-primary mt-2">
                  {trackingDays}<span className="text-base text-gray-400">/7</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">{trackingConsistency}% recorded</p>
              </div>

              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-sm text-textSecondary">BMI</p>
                <p className="text-3xl font-bold text-primary mt-2">{profile.bodyAnalysis?.bmi ?? "—"}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {profile.bodyAnalysis?.category || "Body composition"}
                </p>
              </div>

              <div className="bg-primary text-white rounded-2xl shadow-card p-5">
                <p className="text-sm opacity-80">Current Streak</p>
                <p className="text-4xl font-bold mt-2">{streak}</p>
                <p className="text-xs opacity-80 mt-1">days</p>
              </div>
            </div>

            {/* Health + profile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-white rounded-2xl shadow-card p-5 border border-green-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-textSecondary">Health Assessment</p>
                  <span className="text-xl">❤️</span>
                </div>
                <p className="text-3xl font-bold text-green-600 mt-2">{healthScore}/100</p>
                <p className="text-xs text-gray-400 mt-1">
                  {healthScore >= 85 ? "Excellent" : healthScore >= 70 ? "Good" : healthScore >= 50 ? "Needs improvement" : "Complete your assessment"}
                </p>
                <button
                  onClick={() => navigate("/health-assessment?update=true")}
                  className="mt-4 w-full bg-green-500 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-green-600 transition"
                >
                  Update Health Assessment
                </button>
              </div>

              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-sm text-textSecondary">Weight</p>
                <p className="text-3xl font-bold text-primary mt-2">
                  {profile.weight ?? "—"}<span className="text-base text-gray-400"> kg</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Current profile weight</p>
              </div>

              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-sm text-textSecondary">Activity Level</p>
                <p className="text-xl font-bold text-primary mt-3 capitalize">
                  {profile.activityLevel || "Not set"}
                </p>
                <p className="text-xs text-gray-400 mt-1">From your profile</p>
              </div>
            </div>

            {/* 7-day activity */}
            <div className="bg-white rounded-2xl shadow-card p-6 mt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">📈 7-Day Activity</h2>
                  <p className="text-sm text-textSecondary mt-1">
                    Daily steps from your latest tracking records.
                  </p>
                </div>
                <span className="text-sm font-bold text-primary">{trackingDays}/7 tracked</span>
              </div>

              <div className="mt-7 h-48 flex items-end gap-2 sm:gap-3">
                {(last7DaysTracking.length
                  ? last7DaysTracking
                  : Array.from({ length: 7 }, (_, i) => ({
                      date: getPastDateKey(6 - i),
                      recorded: false
                    }))
                ).map((day) => {
                  const record = trackingRecords.find((item) => item.date === day.date);
                  const steps = Number(record?.steps || 0);
                  const weekRecords = last7DaysTracking.map((d) =>
                    Number(trackingRecords.find((r) => r.date === d.date)?.steps || 0)
                  );
                  const maxSteps = Math.max(10000, ...weekRecords);
                  const height = record ? Math.max(8, Math.min(100, (steps / maxSteps) * 100)) : 6;
                  const date = new Date(`${day.date}T00:00:00`);

                  return (
                    <div key={day.date} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {record ? steps.toLocaleString() : "—"}
                      </span>
                      <div className="w-full max-w-14 h-32 bg-orange-50 rounded-xl overflow-hidden flex items-end">
                        <div
                          className={`w-full rounded-xl transition-all duration-700 ${
                            record ? "bg-primary" : "bg-orange-100"
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-textSecondary">
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-gray-400 mt-4">
                Actual steps are shown here; missing tracking days remain empty.
              </p>
            </div>

            {/* FIS breakdown */}
            <div className="bg-white rounded-2xl shadow-card p-6 mt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">❤️ Fitness Score Breakdown</h2>
                  <p className="text-sm text-textSecondary mt-1">
                    The five E1 dimensions behind your score.
                  </p>
                </div>
                <button
                  onClick={() => setActivePage("analytics")}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  View analytics →
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  ["🏃", "Fitness & Activity", fisResult?.fitnessActivity?.score],
                  ["😴", "Recovery", fisResult?.recovery?.score],
                  ["⚖️", "Body Composition", fisResult?.bodyComposition?.score],
                  ["🥗", "Nutrition", fisResult?.nutrition?.score],
                  ["🔥", "Consistency", fisResult?.consistency?.score]
                ].map(([icon, label, score]) => {
                  const isConsistencyPending = label === "Consistency" && (trackingRecords?.length < 3 || score == null);
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium">{icon} {label}</span>
                        <span className="font-bold text-primary text-xs sm:text-sm">
                          {isConsistencyPending
                            ? "Establishing baseline"
                            : (score == null ? "—" : `${Math.round(score)}/100`)}
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${isConsistencyPending ? "bg-amber-300" : "bg-primary"} rounded-full transition-all duration-700`}
                          style={{
                            width: isConsistencyPending
                              ? `${Math.max(15, Math.min(100, ((trackingRecords?.length || 1) / 3) * 100))}%`
                              : `${Math.max(0, Math.min(100, Number(score) || 0))}%`
                          }}
                        />
                      </div>
                      {isConsistencyPending && (
                        <p className="text-[11px] text-textSecondary mt-1">
                          Consistency baseline is still being established.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 365-day Fitness Pulse */}
            <div className="bg-white rounded-2xl shadow-card p-6 mt-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">🟠 Fitness Pulse</h2>
                  <p className="text-sm text-textSecondary mt-1">
                    365-day activity calendar. Darker cells mean stronger daily activity.
                  </p>
                </div>
                <div className="text-sm text-gray-500">365-day history</div>
              </div>

              <div className="mt-6 overflow-x-auto pb-2">
                <div className="min-w-[760px] grid grid-cols-12 gap-2">
                  {Array.from({ length: 12 }, (_, monthIndex) => {
                    const now = new Date();
                    const monthDate = new Date(now.getFullYear(), now.getMonth() - 11 + monthIndex, 1);
                    const year = monthDate.getFullYear();
                    const month = monthDate.getMonth();
                    const monthName = monthDate.toLocaleDateString("en-US", { month: "short" });
                    const daysInMonth = new Date(year, month + 1, 0).getDate();

                    return (
                      <div key={`${year}-${month}`} className="min-w-0">
                        <p className="text-[11px] font-semibold text-gray-500 text-center mb-2">
                          {monthName}
                        </p>
                        <div className="grid grid-cols-4 gap-1">
                          {Array.from({ length: daysInMonth }, (_, dayIndex) => {
                            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayIndex + 1).padStart(2, "0")}`;
                            const record = trackingRecords.find((item) => item.date === dateKey);
                            const score = getActivityScore(record);
                            const level = !record
                              ? 0
                              : score < 25
                              ? 1
                              : score < 55
                              ? 2
                              : score < 80
                              ? 3
                              : 4;

                            const cellClasses = [
                              "bg-gray-100",
                              "bg-orange-100",
                              "bg-orange-200",
                              "bg-orange-300",
                              "bg-primary"
                            ];

                            const date = new Date(`${dateKey}T00:00:00`);

                            return (
                              <div
                                key={dateKey}
                                title={`${date.toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                })} • ${record ? `${score}% activity` : "No tracking"}`}
                                className={`h-3.5 rounded-sm ${cellClasses[level]} hover:ring-2 hover:ring-orange-200 transition`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>Less</span>
                {[
                  "bg-gray-100",
                  "bg-orange-100",
                  "bg-orange-200",
                  "bg-orange-300",
                  "bg-primary"
                ].map((color) => (
                  <span key={color} className={`w-3.5 h-3.5 rounded-sm ${color}`} />
                ))}
                <span>More</span>
              </div>
            </div>

            {/* Goals + weekly overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl shadow-card p-6 border border-orange-100">
                <p className="text-sm font-semibold text-primary uppercase tracking-wide">
                  Today’s Goals
                </p>
                <h2 className="text-2xl font-bold mt-2">Choose what you complete today.</h2>
                <p className="text-sm text-textSecondary mt-2">
                  Your selections are saved and restored after refresh.
                </p>

                <div className="mt-5 space-y-3">
                  {[
                    ["water", "💧", "Reach your water target"],
                    ["workout", "🏃", "Complete your workout"],
                    ["steps", "👣", "Reach your daily steps"],
                    ["sleep", "😴", "Meet your sleep target"]
                  ].map(([key, icon, label]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        goals[key]
                          ? "bg-green-50 border-green-200"
                          : "bg-white border-orange-100 hover:border-orange-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(goals[key])}
                        onChange={() => toggleGoal(key)}
                        className="w-4 h-4 accent-orange-600"
                      />
                      <span className="text-lg">{icon}</span>
                      <span
                        className={`text-sm font-medium ${
                          goals[key] ? "text-green-700 line-through" : "text-gray-700"
                        }`}
                      >
                        {label}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-textSecondary">Today’s completion</span>
                  <span className="font-bold text-primary">
                    {Object.values(goals).filter(Boolean).length}/4
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-card p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">📊 Weekly Overview</h2>
                    <p className="text-sm text-textSecondary mt-1">
                      How well you met your weekly targets.
                    </p>
                  </div>
                  <span className="text-sm font-bold text-primary">{trackingDays}/7 days</span>
                </div>

                {(() => {
                  const recent = last7DaysTracking
                    .map((day) => trackingRecords.find((item) => item.date === day.date))
                    .filter(Boolean);

                  const avgSteps = recent.length
                    ? Math.round(recent.reduce((sum, r) => sum + (Number(r.steps) || 0), 0) / recent.length)
                    : 0;
                  const avgWater = recent.length
                    ? recent.reduce((sum, r) => sum + (Number(r.waterIntake) || 0), 0) / recent.length
                    : 0;
                  const avgSleep = recent.length
                    ? recent.reduce((sum, r) => sum + (Number(r.sleepHours) || 0), 0) / recent.length
                    : 0;
                  const workoutDays = recent.filter(
                    (r) => r.workoutCompleted || Number(r.exerciseMinutes || 0) >= 30
                  ).length;

                  const metrics = [
                    ["👣", "Steps", `${avgSteps.toLocaleString()}/day`, Math.min(100, Math.round((avgSteps / 7500) * 100))],
                    ["💧", "Water", `${avgWater.toFixed(1)} L/day`, Math.min(100, Math.round((avgWater / 2) * 100))],
                    ["😴", "Sleep", `${avgSleep.toFixed(1)} h/day`, Math.min(100, Math.round((avgSleep / 7) * 100))],
                    ["🏃", "Exercise", `${workoutDays}/7 days`, Math.min(100, Math.round((workoutDays / 5) * 100))]
                  ];

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                      {metrics.map(([icon, label, value, percent]) => (
                        <div key={label} className="rounded-xl bg-gray-50 p-4">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold">{icon} {label}</span>
                            <span className="text-xs font-bold text-primary">{percent}%</span>
                          </div>
                          <p className="text-lg font-bold mt-2">{value}</p>
                          <div className="h-2 bg-gray-200 rounded-full mt-3 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 🎯 TODAY'S FOCUS — COMPACT DASHBOARD PREVIEW */}
            <div className="bg-white rounded-2xl shadow-card p-6 mt-6 border border-orange-50 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎯</span>
                    <h2 className="text-xl font-bold text-textPrimary font-heading">Today's Focus</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-primary">
                      Your Current Priority
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-textSecondary mt-1">
                    Quick daily direction calibrated from your latest check-in data.
                  </p>
                </div>
                <button
                  onClick={() => setActivePage("insights")}
                  className="inline-flex items-center gap-1.5 text-xs md:text-sm font-bold text-primary hover:text-orange-700 transition self-start sm:self-auto bg-orange-50 hover:bg-orange-100/80 px-3.5 py-2 rounded-xl"
                >
                  <span>View AI Insights</span>
                  <span>→</span>
                </button>
              </div>

              {interpretationLoading ? (
                <div className="py-6 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-orange-100 shrink-0"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-48 bg-gray-200 rounded"></div>
                    <div className="h-3 w-72 bg-gray-100 rounded"></div>
                  </div>
                </div>
              ) : (
                (() => {
                  const priorityActions = interpretationResult?.user_mode?.priority_actions || [];
                  const topAction = priorityActions.length > 0 ? priorityActions[0] : null;
                  const secondaryAction = priorityActions.length > 1 ? priorityActions[1] : null;

                  if (!topAction) {
                    return (
                      <div className="py-5 text-left text-sm text-gray-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p>
                          {!dailyTrackingRecorded
                            ? "Complete today's check-in to get your personalized focus for today."
                            : "Tracking recorded! Log your daily habits to generate today's targeted focus."}
                        </p>
                        {!dailyTrackingRecorded && (
                          <button
                            onClick={() => setActivePage("tracking")}
                            className="px-3.5 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition shrink-0"
                          >
                            Take Check-in
                          </button>
                        )}
                      </div>
                    );
                  }

                  const topTitle = typeof topAction === "object" ? (topAction.title || topAction.action) : String(topAction);
                  const topDesc = typeof topAction === "object"
                    ? (topAction.what_is_happening || topAction.what_to_do_next || topAction.description || topAction.why_it_matters || "")
                    : "";

                  return (
                    <div className="pt-4 space-y-3">
                      {/* Primary Focus Card */}
                      <div className="bg-gradient-to-r from-orange-50/70 to-amber-50/40 border border-orange-100/80 rounded-xl p-4 flex items-start gap-3.5">
                        <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                          1
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-textPrimary text-base">
                              {topTitle}
                            </h3>
                            {topAction.related_engine && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider bg-orange-100/80 text-primary px-2 py-0.5 rounded-full">
                                {topAction.related_engine}
                              </span>
                            )}
                          </div>
                          {topDesc && (
                            <p className="text-xs md:text-sm text-textSecondary mt-1 leading-relaxed">
                              {topDesc}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Secondary Focus Item (if available) - compact one-liner */}
                      {secondaryAction && (
                        <div className="flex items-center justify-between text-xs md:text-sm p-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-orange-50/40 transition">
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center shrink-0">
                              2
                            </span>
                            <span className="font-semibold text-textPrimary truncate">
                              {typeof secondaryAction === "object" ? (secondaryAction.title || secondaryAction.action) : String(secondaryAction)}
                            </span>
                          </div>
                          <button
                            onClick={() => setActivePage("insights")}
                            className="text-xs font-bold text-primary hover:underline shrink-0 ml-2"
                          >
                            Details →
                          </button>
                        </div>
                      )}

                      {/* Bottom link to full analysis in AI Insights */}
                      <div className="pt-2 flex items-center justify-end">
                        <button
                          onClick={() => setActivePage("insights")}
                          className="text-xs font-bold text-primary hover:text-orange-700 flex items-center gap-1 transition"
                        >
                          <span>View full recommendations and analysis in AI Insights</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </>
        )}
      </div>
    </>
  )}

  {activePage === "analytics" && (
  <div className="analytics-page-wrapper">
      <div className="analytics-content-wrapper">
        {(analyticsError || behaviorError) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-amber-900">
            <p className="font-semibold">Some analytics could not be loaded.</p>
            {analyticsError && <p className="text-sm mt-1">{analyticsError}</p>}
            {behaviorError && (
              <p className="text-sm mt-1">Behavior analysis: {behaviorError}</p>
            )}
          </div>
        )}
        <Analytics
          profile={profile}
          trackingRecords={trackingRecords}
          fisResult={fisResult}
          behaviorResult={behaviorResult}
          predictionResult={predictionResult}
          consistencyPrediction={consistencyPrediction}
          cohortResult={cohortResult}
          anomalyResult={anomalyResult}
          nutritionData={nutritionData}
          streak={streak}
          bestStreak={bestStreak}
        />
      </div>
  </div>
)}

  {activePage === "profile" && (
    <ProfileSection
      profile={profile}
      user={authUser || auth.currentUser}
      onProfileUpdated={(updatedData) => {
        setProfile((prev) => ({
          ...prev,
          ...updatedData,
        }));
      }}
      onLogout={handleLogout}
    />
  )}

  {activePage === "nutrition" && (
  <div className="max-w-6xl mx-auto space-y-8 pb-12">

    {/* Header */}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <span className="text-4xl">🥗</span>
          <h1 className="text-4xl font-heading font-bold text-textPrimary">
            Today's Nutrition
          </h1>
        </div>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Personalized Indian meal recommendations & macro targets calibrated to your fitness goals, dietary preference, and daily tracking.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {dailyTrackingRecorded ? (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Today's Check-in Connected
          </span>
        ) : (
          <button
            onClick={() => setActivePage("tracking")}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-primary text-xs font-semibold hover:bg-orange-100 transition"
          >
            <span>📝</span> Take Daily Check-in
          </button>
        )}
        <button
          onClick={loadNutritionData}
          disabled={nutritionLoading}
          className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <span>🔄</span> {nutritionLoading ? "Updating..." : "Refresh Plan"}
        </button>
      </div>
    </div>

    {/* Notice if checkin missing */}
    {!dailyTrackingRecorded && (
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-amber-900">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">ℹ️</span>
          <span>
            Today's meal plan is currently calibrated to your profile and previous tracking data. Complete today's check-in to adjust for today's active calories and water.
          </span>
        </div>
        <button
          onClick={() => setActivePage("tracking")}
          className="shrink-0 px-3 py-1 bg-amber-600 text-white rounded-lg font-medium text-xs hover:bg-amber-700 transition"
        >
          Check-in Now
        </button>
      </div>
    )}

    {/* Loading */}
    {nutritionLoading && (
      <div className="bg-white rounded-2xl shadow-card p-10 text-center">
        <div className="text-4xl mb-4 animate-bounce">🥗</div>
        <h2 className="text-xl font-bold text-gray-800">
          Analyzing your nutrition...
        </h2>
        <p className="text-gray-500 mt-2">
          Matching personalized Indian meal combinations and calculating macro distribution.
        </p>
      </div>
    )}

    {/* Error */}
    {!nutritionLoading && nutritionError && (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-red-600 flex items-center gap-2">
          <span>⚠️</span> Nutrition analysis failed
        </h2>
        <p className="text-red-500 mt-2">{nutritionError}</p>
        <button
          onClick={loadNutritionData}
          className="mt-4 px-5 py-2 rounded-xl bg-primary text-white font-semibold hover:opacity-90"
        >
          Try Again
        </button>
      </div>
    )}

    {/* Nutrition Results */}
    {!nutritionLoading && !nutritionError && nutritionData && (
      <>
        {/* ======================================================== */}
        {/* SECTION: YOUR DAILY TARGET */}
        {/* ======================================================== */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span>🎯</span> Your Daily Target
              </h2>
              <p className="text-sm text-gray-500">
                Scientifically calibrated to your basal metabolic rate and fitness goal
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-orange-100 text-primary rounded-full text-xs font-bold uppercase tracking-wider">
                {nutritionData.diet_type || profile?.dietPreference || "Balanced"}
              </span>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold capitalize">
                {profile?.goal?.replace("_", " ") || "Maintenance"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Calories */}
            <div className="bg-white rounded-2xl shadow-card p-5 border-t-4 border-orange-500">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-400">Calories</span>
                <span className="text-xl">🔥</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mt-2">
                {nutritionData.targets?.calorie_target !== undefined && nutritionData.targets?.calorie_target !== null ? nutritionData.targets.calorie_target : "Data unavailable"}
              </h3>
              <p className="text-xs text-gray-400 mt-1">kcal / day</p>
            </div>

            {/* Protein */}
            <div className="bg-white rounded-2xl shadow-card p-5 border-t-4 border-blue-500">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-400">Protein</span>
                <span className="text-xl">💪</span>
              </div>
              <h3 className="text-2xl font-bold text-blue-600 mt-2">
                {nutritionData.macro_distribution?.protein_g !== undefined && nutritionData.macro_distribution?.protein_g !== null ? `${nutritionData.macro_distribution.protein_g}g` : "Data unavailable"}
              </h3>
              <p className="text-xs text-gray-400 mt-1">grams / day</p>
            </div>

            {/* Carbs */}
            <div className="bg-white rounded-2xl shadow-card p-5 border-t-4 border-emerald-500">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-400">Carbs</span>
                <span className="text-xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold text-emerald-600 mt-2">
                {nutritionData.macro_distribution?.carbs_g !== undefined && nutritionData.macro_distribution?.carbs_g !== null ? `${nutritionData.macro_distribution.carbs_g}g` : "Data unavailable"}
              </h3>
              <p className="text-xs text-gray-400 mt-1">grams / day</p>
            </div>

            {/* Fat */}
            <div className="bg-white rounded-2xl shadow-card p-5 border-t-4 border-purple-500">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-400">Fats</span>
                <span className="text-xl">🥑</span>
              </div>
              <h3 className="text-2xl font-bold text-purple-600 mt-2">
                {nutritionData.macro_distribution?.fat_g !== undefined && nutritionData.macro_distribution?.fat_g !== null ? `${nutritionData.macro_distribution.fat_g}g` : "Data unavailable"}
              </h3>
              <p className="text-xs text-gray-400 mt-1">grams / day</p>
            </div>

            {/* Water Target */}
            <div className="bg-white rounded-2xl shadow-card p-5 border-t-4 border-sky-500 col-span-2 md:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-400">Water Target</span>
                <span className="text-xl">💧</span>
              </div>
              <h3 className="text-2xl font-bold text-sky-600 mt-2">
                {nutritionData.targets?.water_liters !== undefined && nutritionData.targets?.water_liters !== null ? `${nutritionData.targets.water_liters} L` : "Data unavailable"}
              </h3>
              <p className="text-xs text-gray-400 mt-1">liters / day</p>
            </div>
          </div>

          {/* BMR / TDEE Sub-bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Basal Metabolic Rate (BMR)</p>
              <p className="text-base font-bold text-gray-700 mt-0.5">
                {nutritionData.targets?.bmr ? `${nutritionData.targets.bmr} kcal` : "Data unavailable"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Daily Energy (TDEE)</p>
              <p className="text-base font-bold text-gray-700 mt-0.5">
                {nutritionData.targets?.tdee ? `${nutritionData.targets.tdee} kcal` : "Data unavailable"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Activity Level</p>
              <p className="text-base font-bold text-gray-700 mt-0.5 capitalize">
                {profile?.activityLevel || "Moderate"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Meal Structure</p>
              <p className="text-base font-bold text-gray-700 mt-0.5">
                4 Meals (B / L / S / D)
              </p>
            </div>
          </div>
        </div>

        {/* AI Insight banner */}
        {nutritionData.insight && (
          <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-white border border-orange-200/80 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl shrink-0">
                💡
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-800 text-base mb-1">
                  Nutrition Intelligence Insight
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {nutritionData.insight}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* SECTION: TODAY'S MEAL PLAN */}
        {/* ======================================================== */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span>🍽️</span> Today's Meal Plan
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Complete, realistic Indian meals tailored to your diet and calorie targets
              </p>
            </div>
            {nutritionData.meal_plan?.goal_message && (
              <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
                {nutritionData.meal_plan.goal_message}
              </span>
            )}
          </div>

          {nutritionData?.meal_plan ? (
            <div className="grid grid-cols-1 gap-6">
              {[
                { slot: "breakfast", emoji: "🌅", title: "Breakfast" },
                { slot: "lunch", emoji: "☀️", title: "Lunch" },
                { slot: "snack", emoji: "🍎", title: "Evening Snack" },
                { slot: "dinner", emoji: "🌙", title: "Dinner" }
              ].map(({ slot, emoji, title }) => {
                const meal = nutritionData.meal_plan[slot];
                if (!meal) return null;

                return (
                  <div
                    key={slot}
                    className="bg-white rounded-2xl shadow-card p-6 border border-gray-100 hover:border-orange-200 hover:shadow-lg transition-all duration-200"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                      
                      {/* Left: Meal details */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="px-3 py-1 rounded-full bg-orange-100 text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span>{emoji}</span> {title}
                          </span>
                          {meal.cuisine && (
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                              {meal.cuisine}
                            </span>
                          )}
                          {meal.prep_time && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              ⏱️ {meal.prep_time}
                            </span>
                          )}
                          {meal.diet_type && (
                            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                              meal.diet_type === "non_vegetarian"
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : meal.diet_type === "vegan"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}>
                              {meal.diet_type === "non_vegetarian" ? "Non-Veg" : meal.diet_type === "vegan" ? "Vegan" : "Veg"}
                            </span>
                          )}
                        </div>

                        {/* Complete meal name */}
                        <h3 className="text-2xl font-bold text-gray-800 tracking-tight">
                          {meal.meal}
                        </h3>

                        {/* Short simple explanation */}
                        <p className="text-gray-600 text-sm leading-relaxed">
                          {meal.explanation}
                        </p>

                        {/* Ingredients & Serving Size */}
                        <div className="pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {meal.ingredients && (
                            <div className="bg-gray-50 rounded-xl p-3">
                              <span className="font-bold text-gray-700 block mb-1">
                                🥣 Ingredients:
                              </span>
                              <span className="text-gray-600 leading-normal">
                                {meal.ingredients}
                              </span>
                            </div>
                          )}
                          {meal.serving_size && (
                            <div className="bg-gray-50 rounded-xl p-3">
                              <span className="font-bold text-gray-700 block mb-1">
                                📏 Serving Size:
                              </span>
                              <span className="text-gray-600 leading-normal">
                                {meal.serving_size}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Nutrition metrics pill stack */}
                      <div className="shrink-0 flex lg:flex-col gap-2.5 flex-wrap justify-between lg:min-w-[140px] bg-orange-50/50 p-3.5 rounded-2xl border border-orange-100/60">
                        <div className="text-center p-2 rounded-xl bg-white shadow-xs flex-1 lg:flex-none">
                          <span className="text-[10px] font-bold uppercase text-gray-400 block">Energy</span>
                          <span className="text-base font-bold text-gray-800">
                            {meal.calories !== undefined && meal.calories !== null ? meal.calories : "—"} <span className="text-xs font-normal text-gray-500">kcal</span>
                          </span>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-white shadow-xs flex-1 lg:flex-none">
                          <span className="text-[10px] font-bold uppercase text-blue-500 block">Protein</span>
                          <span className="text-base font-bold text-blue-600">
                            {meal.protein !== undefined && meal.protein !== null ? meal.protein : "—"}<span className="text-xs font-normal text-blue-400">g</span>
                          </span>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-white shadow-xs flex-1 lg:flex-none">
                          <span className="text-[10px] font-bold uppercase text-emerald-500 block">Carbs</span>
                          <span className="text-base font-bold text-emerald-600">
                            {meal.carbs !== undefined && meal.carbs !== null ? meal.carbs : "—"}<span className="text-xs font-normal text-emerald-400">g</span>
                          </span>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-white shadow-xs flex-1 lg:flex-none">
                          <span className="text-[10px] font-bold uppercase text-purple-500 block">Fat</span>
                          <span className="text-base font-bold text-purple-600">
                            {meal.fats !== undefined && meal.fats !== null ? meal.fats : "—"}<span className="text-xs font-normal text-purple-400">g</span>
                          </span>
                        </div>
                        {meal.fiber !== undefined && meal.fiber !== null && (
                          <div className="text-center p-2 rounded-xl bg-white shadow-xs flex-1 lg:flex-none">
                            <span className="text-[10px] font-bold uppercase text-amber-500 block">Fiber</span>
                            <span className="text-base font-bold text-amber-600">
                              {meal.fiber}<span className="text-xs font-normal text-amber-400">g</span>
                            </span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card p-10 text-center">
              <h3 className="text-xl font-bold mb-2">Generating meal plan...</h3>
              <p className="text-gray-500">
                Complete today's check-in to get a personalized meal plan if it doesn't appear.
              </p>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* SECTION: DAILY NUTRITION SUMMARY (Target vs Planned) */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl shadow-card p-6 border border-gray-100">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <span>📊</span> Daily Nutrition Summary
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Target vs Planned macronutrient balance for today's selected meals
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Calories Summary */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-700 text-sm">🔥 Calories</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  Math.abs(nutritionData.summary?.calories?.difference || 0) < 150
                    ? "bg-green-100 text-green-700"
                    : "bg-orange-100 text-primary"
                }`}>
                  {nutritionData.summary?.calories?.difference > 0 ? "+" : ""}
                  {nutritionData.summary?.calories?.difference ?? 0} kcal
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target:</span>
                  <span className="font-bold text-gray-800">{nutritionData.summary?.calories?.target ?? nutritionData.targets?.calorie_target} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Planned:</span>
                  <span className="font-bold text-primary">{nutritionData.summary?.calories?.planned ?? nutritionData.planned_totals?.calories ?? "—"} kcal</span>
                </div>
              </div>
              <div className="mt-3.5 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((nutritionData.summary?.calories?.planned || 1) / (nutritionData.summary?.calories?.target || 1)) * 100))}%`
                  }}
                />
              </div>
            </div>

            {/* Protein Summary */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-blue-700 text-sm">💪 Protein</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  Math.abs(nutritionData.summary?.protein_g?.difference || 0) < 20
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}>
                  {nutritionData.summary?.protein_g?.difference > 0 ? "+" : ""}
                  {nutritionData.summary?.protein_g?.difference ?? 0}g
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target:</span>
                  <span className="font-bold text-gray-800">{nutritionData.summary?.protein_g?.target ?? nutritionData.macro_distribution?.protein_g}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Planned:</span>
                  <span className="font-bold text-blue-600">{nutritionData.summary?.protein_g?.planned ?? nutritionData.planned_totals?.protein_g ?? "—"}g</span>
                </div>
              </div>
              <div className="mt-3.5 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((nutritionData.summary?.protein_g?.planned || 1) / (nutritionData.summary?.protein_g?.target || 1)) * 100))}%`
                  }}
                />
              </div>
            </div>

            {/* Carbs Summary */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-emerald-700 text-sm">⚡ Carbs</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  Math.abs(nutritionData.summary?.carbs_g?.difference || 0) < 30
                    ? "bg-green-100 text-green-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}>
                  {nutritionData.summary?.carbs_g?.difference > 0 ? "+" : ""}
                  {nutritionData.summary?.carbs_g?.difference ?? 0}g
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target:</span>
                  <span className="font-bold text-gray-800">{nutritionData.summary?.carbs_g?.target ?? nutritionData.macro_distribution?.carbs_g}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Planned:</span>
                  <span className="font-bold text-emerald-600">{nutritionData.summary?.carbs_g?.planned ?? nutritionData.planned_totals?.carbs_g ?? "—"}g</span>
                </div>
              </div>
              <div className="mt-3.5 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((nutritionData.summary?.carbs_g?.planned || 1) / (nutritionData.summary?.carbs_g?.target || 1)) * 100))}%`
                  }}
                />
              </div>
            </div>

            {/* Fat Summary */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-purple-700 text-sm">🥑 Fat</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  Math.abs(nutritionData.summary?.fat_g?.difference || 0) < 15
                    ? "bg-green-100 text-green-700"
                    : "bg-purple-100 text-purple-700"
                }`}>
                  {nutritionData.summary?.fat_g?.difference > 0 ? "+" : ""}
                  {nutritionData.summary?.fat_g?.difference ?? 0}g
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target:</span>
                  <span className="font-bold text-gray-800">{nutritionData.summary?.fat_g?.target ?? nutritionData.macro_distribution?.fat_g}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Planned:</span>
                  <span className="font-bold text-purple-600">{nutritionData.summary?.fat_g?.planned ?? nutritionData.planned_totals?.fat_g ?? "—"}g</span>
                </div>
              </div>
              <div className="mt-3.5 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((nutritionData.summary?.fat_g?.planned || 1) / (nutritionData.summary?.fat_g?.target || 1)) * 100))}%`
                  }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            * Daily meal plans prioritize nutritional balance and whole-food satiety within practical dietary tolerance.
          </p>
        </div>

        {/* ======================================================== */}
        {/* SECTION: HYDRATION */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl shadow-card p-6 border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span>💧</span> Hydration
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Track your fluid consumption against your daily metabolic requirements
              </p>
            </div>
            {nutritionData.hydration?.is_logged ? (
              <span className="px-3 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full text-xs font-semibold">
                ✓ Recorded Today
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                Not logged yet today
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Current Logged */}
            <div className="bg-sky-50/50 border border-sky-100 rounded-2xl p-5">
              <span className="text-xs uppercase font-bold text-gray-500">Current Water Intake</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-sky-700">
                  {nutritionData.hydration?.is_logged
                    ? `${nutritionData.hydration.current_liters} L`
                    : "Data unavailable"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {nutritionData.hydration?.is_logged
                  ? "Logged from today's Daily Check-in"
                  : "Log intake during Daily Check-in to track progress"}
              </p>
            </div>

            {/* Target */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
              <span className="text-xs uppercase font-bold text-gray-500">Daily Water Target</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-gray-800">
                  {nutritionData.hydration?.target_liters !== undefined && nutritionData.hydration?.target_liters !== null ? `${nutritionData.hydration.target_liters} L` : (nutritionData.targets?.water_liters !== undefined && nutritionData.targets?.water_liters !== null ? `${nutritionData.targets.water_liters} L` : "Data unavailable")}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Optimized for body weight & activity level
              </p>
            </div>

            {/* Remaining */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
              <span className="text-xs uppercase font-bold text-gray-500">Remaining Amount</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-primary">
                  {nutritionData.hydration?.remaining_liters !== undefined && nutritionData.hydration?.remaining_liters !== null
                    ? `${nutritionData.hydration.remaining_liters} L`
                    : "Data unavailable"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Remaining to reach hydration goal
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-2">
              <span>Hydration Progress</span>
              <span>{nutritionData.hydration?.percentage ?? 0}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-500"
                style={{ width: `${nutritionData.hydration?.percentage ?? 0}%` }}
              />
            </div>
          </div>
        </div>

      </>
    )}

    {/* Initial state */}
    {!nutritionLoading && !nutritionError && !nutritionData && (
      <div className="bg-white rounded-2xl shadow-card p-10 text-center">
        <div className="text-5xl mb-4">🥗</div>
        <h2 className="text-2xl font-bold text-gray-800">
          Personalized Nutrition Intelligence
        </h2>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          FitIQ is ready to calculate your daily targets and curate a full Indian meal plan.
        </p>
        <button
          onClick={loadNutritionData}
          className="mt-6 px-6 py-2.5 bg-primary text-white font-semibold rounded-xl hover:opacity-90 shadow-md transition"
        >
          Generate Today's Meal Plan
        </button>
      </div>
    )}

  </div>
)}

  {activePage === "insights" && (
  <>
    {/* ===== E7 AI INSIGHTS PAGE ===== */}
    <div className="max-w-5xl mx-auto text-left">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-3xl">🧠</span>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-textPrimary">
              AI Insights & Analysis
            </h1>
          </div>
          <p className="text-base text-textSecondary mt-2">
            Detailed habit analysis, multi-engine connections, and prioritized action plans.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            techModeEnabled ? "bg-gray-800 text-white" : "bg-orange-100 text-primary"
          }`}>
            {techModeEnabled ? "🔬 Technical Mode" : "👤 Standard View"}
          </span>
          <button
            onClick={() => setTechModeEnabled(prev => !prev)}
            className="bg-white border border-gray-200 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-orange-50 transition shadow-sm"
          >
            Switch to {techModeEnabled ? "Standard" : "Technical"} Mode
          </button>
        </div>
      </div>

      {(analyticsError || behaviorError) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-amber-900">
          <p className="font-semibold">Some analytics could not be loaded.</p>
          {analyticsError && <p className="text-sm mt-1">{analyticsError}</p>}
          {behaviorError && (
            <p className="text-sm mt-1">Behavior analysis: {behaviorError}</p>
          )}
        </div>
      )}

      {/* Loading State */}
      {interpretationLoading && (
        <div className="bg-white rounded-2xl shadow-card p-8 flex flex-col items-center justify-center gap-4 min-h-[200px]">
          <div className="w-12 h-12 border-4 border-orange-100 border-t-primary rounded-full animate-spin" />
          <p className="text-textSecondary text-sm font-medium">Generating your personalized AI insights…</p>
          <p className="text-xs text-gray-400">Analyzing all 7 analytics engines</p>
        </div>
      )}

      {/* Error State */}
      {interpretationError && !interpretationLoading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6 text-red-700">
          <p className="font-semibold">⚠️ {interpretationError}</p>
          <p className="text-sm mt-1 text-red-500">Your analytics results are still displayed in the Analytics section.</p>
        </div>
      )}

      {/* No data yet */}
      {!interpretationResult && !interpretationLoading && !interpretationError && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-8 text-center">
          <p className="text-2xl mb-2">🧠</p>
          {dailyTrackingRecorded ? (
            <>
              <p className="font-semibold text-textPrimary">Insights will appear after your analytics data loads.</p>
              <p className="text-sm text-textSecondary mt-1">Please wait while your data is being processed.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-textPrimary text-lg">Complete your Daily Check-in to receive personalized insights.</p>
              <button 
                onClick={() => setActivePage("tracking")} 
                className="mt-6 px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-orange-600 transition"
              >
                Take Check-in
              </button>
            </>
          )}
        </div>
      )}

      {interpretationResult && !interpretationLoading && (() => {
        const um = interpretationResult.user_mode || {};
        const tm = interpretationResult.technical_mode || {};
        const source = interpretationResult.source || "analytics_interpretation_engine";
        const isLLM = source === "llm";

        return (
          <div className="space-y-6">

            {/* Source badge */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                isLLM
                  ? "bg-purple-100 text-purple-700"
                  : "bg-orange-100 text-primary"
              }`}>
                {isLLM ? "✨ LLM-Powered" : "⚙️ Deterministic Engine"}
              </span>
              <span className="text-xs text-gray-400">
                {isLLM
                  ? "Insights generated by Gemini/OpenAI using your analytics outputs"
                  : "Insights generated by FitIQ's built-in interpretation engine"}
              </span>
            </div>

            {/* 1. AI Health Summary */}
            {um.overall_summary && (
              <div className="bg-gradient-to-br from-primary to-orange-700 text-white rounded-2xl p-6 shadow-card">
                <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">AI Health Summary</p>
                <p className="text-lg leading-relaxed font-medium">{um.overall_summary}</p>
              </div>
            )}

            {/* 2. Strengths + 3. Needs Attention */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {um.strengths?.length > 0 && (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
                  <h2 className="font-bold text-green-700 text-base mb-3 flex items-center gap-2">
                    <span>✅</span> Strengths
                  </h2>
                  <ul className="space-y-2">
                    {um.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-green-500 mt-0.5 shrink-0">●</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {um.what_needs_attention?.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                  <h2 className="font-bold text-amber-700 text-base mb-3 flex items-center gap-2">
                    <span>⚠️</span> Needs Attention
                  </h2>
                  <ul className="space-y-2">
                    {um.what_needs_attention.map((n, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-amber-500 mt-0.5 shrink-0">●</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 4. Priority Actions */}
            {um.priority_actions?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-xl font-bold mb-1">🎯 Priority Actions</h2>
                <p className="text-sm text-textSecondary mb-5">Personalized, engine-backed actions ranked by impact.</p>
                <div className="space-y-4">
                  {um.priority_actions.map((action, i) => (
                    <div key={i} className="flex gap-4 p-4 rounded-xl border border-orange-100 bg-orange-50/40">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white font-bold flex items-center justify-center text-sm">
                        {action.priority || i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-textPrimary text-sm">{action.title || action.action}</p>
                          {action.since_last_checkin && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="text-[10px] uppercase font-bold text-blue-500">Since last check-in:</span>
                              <span>{action.since_last_checkin}</span>
                            </span>
                          )}
                        </div>
                        {action.what_is_happening && (
                          <p className="text-sm text-gray-700 mt-2"><strong>What's happening:</strong> {action.what_is_happening}</p>
                        )}
                        {action.why_it_matters && (
                          <p className="text-sm text-amber-700 mt-1"><strong>Why it matters:</strong> {action.why_it_matters}</p>
                        )}
                        {action.what_to_do_next && (
                          <p className="text-sm text-green-700 mt-1"><strong>What to do next:</strong> {action.what_to_do_next}</p>
                        )}
                        {action.evidence && (
                          <p className="text-xs text-primary mt-3 font-medium">Why FitIQ recommends this: {action.evidence}</p>
                        )}
                        {action.related_engine && (
                          <span className="inline-block mt-3 text-[10px] font-bold bg-orange-100 text-primary px-2 py-0.5 rounded-full">
                            {action.related_engine}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Why These Recommendations */}
            {um.why_these_recommendations && (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Why These Recommendations?</p>
                <p className="text-sm text-gray-600 leading-relaxed">{um.why_these_recommendations}</p>
              </div>
            )}

            {/* Cross-Engine Insights */}
            {um.cross_engine_insights?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-xl font-bold mb-1">🔗 Cross-Engine Insights</h2>
                <p className="text-sm text-textSecondary mb-5">How your different analytics engines connect.</p>
                <div className="space-y-3">
                  {um.cross_engine_insights.map((insight, i) => (
                    <div key={i} className="flex gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                      <span className="text-blue-400 mt-0.5 shrink-0">◆</span>
                      <p className="text-sm text-gray-700">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. Key Findings — Engine-wise Analysis */}
            {um.key_findings?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-xl font-bold mb-1">📊 Engine-wise Analysis</h2>
                <p className="text-sm text-textSecondary mb-5">
                  Deep evidence breakdown: Engine Result → What It Means → Telemetry Evidence → Relevant Insight.
                </p>
                <div className="space-y-4">
                  {um.key_findings.map((finding, i) => (
                    <details key={i} className="group border border-gray-100 rounded-xl overflow-hidden">
                      <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-orange-50 transition font-semibold text-sm">
                        <span>{finding.engine}</span>
                        <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-3 text-sm text-gray-700">
                        {finding.finding && (
                          <div className="bg-orange-50 rounded-lg p-3">
                            <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">
                              Engine Result
                            </p>
                            <p>{finding.finding}</p>
                          </div>
                        )}
                        {finding.explanation && (
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                              What It Means
                            </p>
                            <p>{finding.explanation}</p>
                          </div>
                        )}
                        {finding.evidence && (
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                              Evidence from User's Data
                            </p>
                            <p className="font-mono text-xs bg-gray-50 rounded p-2 text-gray-700">{finding.evidence}</p>
                          </div>
                        )}
                        {finding.recommendation && (
                          <div className="bg-emerald-50 rounded-lg p-3">
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">
                              Relevant Insight
                            </p>
                            <p className="text-emerald-900">{finding.recommendation}</p>
                          </div>
                        )}

                        {/* Technical mode overlay */}
                        {techModeEnabled && tm[`engine_${i + 1}`] && (
                          <div className="mt-3 bg-gray-900 text-green-300 rounded-xl p-4 font-mono text-xs space-y-2">
                            <p className="text-green-400 font-bold">[ Technical / Viva Mode ]</p>
                            {Object.entries(tm[`engine_${i + 1}`]).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-gray-400">{k}: </span>
                                <span>{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Full Technical Mode Panel */}
            {techModeEnabled && Object.keys(tm).length > 0 && (
              <div className="bg-gray-900 text-green-300 rounded-2xl p-6 font-mono text-xs">
                <p className="text-green-400 font-bold text-sm mb-4">🔬 Full Technical / Viva Mode — All Engines</p>
                <div className="space-y-4">
                  {Object.entries(tm).map(([key, engine]) => (
                    <div key={key} className="border border-gray-700 rounded-xl p-4">
                      <p className="text-yellow-300 font-bold mb-2">{engine.name || key}</p>
                      {Object.entries(engine).filter(([k]) => k !== "name").map(([k, v]) => (
                        <div key={k} className="mb-1">
                          <span className="text-gray-400">{k}: </span>
                          <span>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        );
      })()}

    </div>
  </>
  )}

  {activePage === "tracking" && (
    <DailyTracking />
  )}

</div>

  </div>

    {/* Mobile bottom navigation — visible only on screens ≤768px */}
    <MobileBottomNav activePage={activePage} setActivePage={setActivePage} />

</div>

  );
}

export default Dashboard;
