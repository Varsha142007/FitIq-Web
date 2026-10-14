import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

/* =========================================================
   LOCAL DATE HELPER
   ========================================================= */

export const getLocalDateKey = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};


/* =========================================================
   USER PROFILE
   ========================================================= */

export const createUserProfile = async (uid, profileData) => {
  const userRef = doc(db, "users", uid);

  await setDoc(userRef, {
    ...profileData,
    createdAt: serverTimestamp(),
  });
};


export const getUserProfile = async (uid) => {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  return null;
};

export const updateUserProfile = async (uid, profileData) => {
  const userRef = doc(db, "users", uid);

  await setDoc(
    userRef,
    {
      ...profileData,
      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    }
  );
};


/* =========================================================
   DAILY TRACKING (STRICT 24-HOUR CYCLE)
   ========================================================= */

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000; // 86,400,000 ms

/**
 * Safely extracts milliseconds from a Firestore Timestamp, number, string, or Date.
 */
export const getTimestampMillis = (ts) => {
  if (!ts) return null;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts.seconds !== undefined) {
    return ts.seconds * 1000 + (ts.nanoseconds ? Math.round(ts.nanoseconds / 1000000) : 0);
  }
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? null : parsed;
  }
  if (ts instanceof Date) return ts.getTime();
  return null;
};

/**
 * Validates whether a Firestore dailyTracking document represents an actual
 * Daily Check-in submitted by the user (as opposed to goal checkboxes or assessments).
 */
export const isCheckInRecord = (record) => {
  if (!record || typeof record !== "object") return false;

  // 1. Explicit formal check-in completed via DailyTracking modal
  if (record.checkInCompleted === true || record.dailyCheckInCompleted === true) {
    return true;
  }

  // 2. All 4 daily tasks/goals ticked and completed
  if (record.goalsCompleted === true) {
    return true;
  }

  // 3. If tasks were explicitly NOT all completed (and no formal check-in flag),
  // do NOT count as a check-in even if a timestamp exists from a previous toggle
  if (record.goalsCompleted === false) {
    const hasSteps = record.steps !== undefined && record.steps !== null && record.steps !== "";
    const hasSleep = record.sleepHours !== undefined && record.sleepHours !== null && record.sleepHours !== "";
    const hasWater = record.waterIntake !== undefined && record.waterIntake !== null && record.waterIntake !== "";
    const hasCalories = record.caloriesConsumed !== undefined && record.caloriesConsumed !== null && record.caloriesConsumed !== "";
    return Boolean(hasSteps && (hasSleep || hasWater || hasCalories));
  }

  // 4. Actual check-in metrics logged
  const hasSteps = record.steps !== undefined && record.steps !== null && record.steps !== "";
  const hasSleep = record.sleepHours !== undefined && record.sleepHours !== null && record.sleepHours !== "";
  const hasWater = record.waterIntake !== undefined && record.waterIntake !== null && record.waterIntake !== "";
  const hasCalories = record.caloriesConsumed !== undefined && record.caloriesConsumed !== null && record.caloriesConsumed !== "";
  if (hasSteps && (hasSleep || hasWater || hasCalories)) {
    return true;
  }

  // 5. Formal check-in timestamp (only for records without goalCompletion or with formal check-in)
  if (!record.goalCompletion && (record.completedAt || record.recordedAt)) {
    return true;
  }

  return false;
};

/**
 * Evaluates the user's latest completed Daily Check-in strictly on a 24-hour cycle.
 * Source of truth: The actual Daily Check-in completion timestamp in Firestore.
 */
export const getLatestCheckInStatus = async (uid) => {
  if (!uid) {
    return {
      isTracked: false,
      canCheckIn: true,
      remainingMs: 0,
      elapsedTime: 0,
      completedAt: null,
      completedAtMillis: null,
      latestRecord: null,
      nextAvailableAt: null
    };
  }

  const allRecords = await getWeeklyTracking(uid);

  // Filter only valid Daily Check-in records (Initial Assessment documents do NOT count)
  const checkInRecords = (allRecords || []).filter((r) => isCheckInRecord(r));

  if (checkInRecords.length === 0) {
    return {
      isTracked: false,
      canCheckIn: true,
      remainingMs: 0,
      elapsedTime: 0,
      completedAt: null,
      completedAtMillis: null,
      latestRecord: null,
      nextAvailableAt: null
    };
  }

  let latestRecord = null;
  let latestMillis = 0;

  for (const record of checkInRecords) {
    const rawTs =
      record.completedAt ||
      record.recordedAt ||
      record.completedAtMillis ||
      record.createdAt ||
      record.timestamp;

    let millis = getTimestampMillis(rawTs);

    // Fallback: if legacy record only has date string "YYYY-MM-DD"
    if (!millis && record.date) {
      const parsed = new Date(`${record.date}T00:00:00`);
      if (!isNaN(parsed.getTime())) {
        millis = parsed.getTime();
      }
    }

    if (millis && millis > latestMillis) {
      latestMillis = millis;
      latestRecord = record;
    }
  }

  if (!latestRecord || !latestMillis) {
    return {
      isTracked: false,
      canCheckIn: true,
      remainingMs: 0,
      elapsedTime: 0,
      completedAt: null,
      completedAtMillis: null,
      latestRecord: null,
      nextAvailableAt: null
    };
  }

  const now = Date.now();
  const elapsedTime = now - latestMillis;
  const isWithin24Hours = elapsedTime >= 0 && elapsedTime < TWENTY_FOUR_HOURS_MS;
  const remainingMs = isWithin24Hours ? TWENTY_FOUR_HOURS_MS - elapsedTime : 0;

  return {
    isTracked: isWithin24Hours,
    canCheckIn: !isWithin24Hours,
    remainingMs,
    elapsedTime,
    completedAt: new Date(latestMillis),
    completedAtMillis: latestMillis,
    latestRecord,
    nextAvailableAt: new Date(latestMillis + TWENTY_FOUR_HOURS_MS)
  };
};

export const saveDailyTracking = async (uid, trackingData) => {
  const date = getLocalDateKey();

  const trackingRef = doc(
    db,
    "users",
    uid,
    "dailyTracking",
    date
  );

  const completedAt = serverTimestamp();
  const completedAtMillis = Date.now();

  const payload = {
    ...trackingData,
    date,
    checkInCompleted: true,
    dailyCheckInCompleted: true,
    completedAt,
    completedAtMillis,
    recordedAt: completedAt,
  };

  await setDoc(trackingRef, payload, { merge: true });

  // Persist latest completion timestamp on user document for fast retrieval
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(
      userRef,
      {
        lastCheckInCompletedAt: completedAt,
        lastCheckInCompletedAtMillis: completedAtMillis,
        lastCheckInRecordDate: date
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not update lastCheckInCompletedAt on profile doc:", err);
  }

  return {
    success: true,
    date,
    completedAtMillis
  };
};

/* =========================================================
   GET ACTIVE CHECK-IN FOR CURRENT 24-HOUR CYCLE
   ========================================================= */

export const getDailyTracking = async (uid) => {
  const status = await getLatestCheckInStatus(uid);
  if (status.isTracked && status.latestRecord) {
    return status.latestRecord;
  }
  return null;
};


/* =========================================================
   GET ALL TRACKING RECORDS
   ========================================================= */

export const getWeeklyTracking = async (uid) => {
  const trackingRef = collection(
    db,
    "users",
    uid,
    "dailyTracking"
  );

  const snapshot = await getDocs(trackingRef);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
};


/* =========================================================
   GET LAST 7 DAYS
   ========================================================= */

export const getLast7DaysTracking = async (uid) => {
  const allRecords = await getWeeklyTracking(uid);

  const recordMap = {};

  allRecords.forEach((record) => {
    if (record.date) {
      recordMap[record.date] = record;
    }
  });

  const result = [];

  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);

    date.setDate(today.getDate() - i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const dateKey = `${year}-${month}-${day}`;

    const record = recordMap[dateKey];

    result.push({
      date: dateKey,
      recorded: !!record,

      steps:
        record?.steps ??
        record?.dailySteps ??
        0,

      exerciseMinutes:
        record?.exerciseMinutes ??
        record?.duration_minutes ??
        record?.durationMinutes ??
        0,

      sleepHours:
        record?.sleepHours ??
        record?.sleep ??
        record?.hoursSleep ??
        0,

      waterIntake:
        record?.waterIntake ??
        record?.hydrationLevel ??
        record?.water ??
        0,

      goalsCompleted:
        record?.goalsCompleted ?? false,

      goalCompletionPercent:
        record?.goalCompletionPercent ?? 0,
    });
  }

  return result;
};


/* =========================================================
   GET LAST 365 DAYS
   ========================================================= */

export const getLast365DaysTracking = async (uid) => {
  const allRecords = await getWeeklyTracking(uid);

  const recordMap = {};

  allRecords.forEach((record) => {
    if (record.date) {
      recordMap[record.date] = record;
    }
  });

  const result = [];

  const today = new Date();

  for (let i = 364; i >= 0; i--) {
    const date = new Date(today);

    date.setDate(today.getDate() - i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const dateKey = `${year}-${month}-${day}`;

    const record = recordMap[dateKey];

    result.push({
      date: dateKey,
      recorded: !!record,

      steps:
        record?.steps ??
        record?.dailySteps ??
        0,

      exerciseMinutes:
        record?.exerciseMinutes ??
        record?.duration_minutes ??
        record?.durationMinutes ??
        0,

      sleepHours:
        record?.sleepHours ??
        record?.sleep ??
        record?.hoursSleep ??
        0,

      waterIntake:
        record?.waterIntake ??
        record?.hydrationLevel ??
        record?.water ??
        0,

      goalsCompleted:
        record?.goalsCompleted ?? false,

      goalCompletionPercent:
        record?.goalCompletionPercent ?? 0,
    });
  }

  return result;
};


/* =========================================================
   DAILY GOALS
   ========================================================= */

export const updateDailyGoals = async (uid, goals) => {
  const date = getLocalDateKey();

  const userRef = doc(db, "users", uid);

  const goalValues = Object.values(goals);

  const completedCount = goalValues.filter(
    (value) => value === true
  ).length;

  const totalGoals = goalValues.length;

  const completionPercent =
    totalGoals > 0
      ? Math.round((completedCount / totalGoals) * 100)
      : 0;

  const goalsCompleted =
    totalGoals > 0 &&
    completedCount === totalGoals;

  await setDoc(
    userRef,
    {
      dailyGoals: goals,
      goalDate: date,
      todayCompleted: goalsCompleted,
    },
    { merge: true }
  );

  /*
   * Store today's goal completion inside the
   * date-based dailyTracking document.
   *
   * This allows the streak to be calculated from
   * historical dates instead of one single streak number.
   */
  const trackingRef = doc(
    db,
    "users",
    uid,
    "dailyTracking",
    date
  );

  const trackingPayload = {
    date,
    goalCompletion: goals,
    goalCompletionPercent: completionPercent,
    goalsCompleted,
  };

  await setDoc(
    trackingRef,
    trackingPayload,
    {
      merge: true,
    }
  );

  return {
    goalsCompleted,
    completionPercent,
  };
};


/* =========================================================
   TODAY COMPLETION
   ========================================================= */

export const updateTodayCompletion = async (
  uid,
  status
) => {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    todayCompleted: status,
  });
};


/* =========================================================
   RECORD DATE EXTRACTION
   ========================================================= */

export const extractRecordDateKey = (record) => {
  if (!record || typeof record !== "object") return null;

  // 1. Explicit date string matching YYYY-MM-DD
  if (typeof record.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date.trim())) {
    return record.date.trim();
  }

  // 2. Document id matching YYYY-MM-DD
  if (typeof record.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.id.trim())) {
    return record.id.trim();
  }

  // 3. Fallback to completed/recorded timestamp in user's local timezone
  const rawTs =
    record.completedAt ||
    record.recordedAt ||
    record.completedAtMillis ||
    record.timestamp ||
    record.createdAt;

  const millis = getTimestampMillis(rawTs);
  if (millis) {
    const d = new Date(millis);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  return null;
};

/* =========================================================
   STREAK CALCULATION
   ========================================================= */

export const calculateStreakFromRecords = (records) => {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
    };
  }

  // Filter only authentic check-in records; never count page views or empty daily goal updates
  const checkInRecords = records.filter((record) => isCheckInRecord(record));
  if (checkInRecords.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
    };
  }

  // Count each calendar day only once using Set
  const completedDates = new Set();
  for (const record of checkInRecords) {
    const dateKey = extractRecordDateKey(record);
    if (dateKey) {
      completedDates.add(dateKey);
    }
  }

  if (completedDates.size === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
    };
  }

  const now = new Date();
  // Anchor to noon local time to prevent DST or midnight edge-case day boundary drift
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayKey = formatDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDate(yesterday);

  let currentStreak = 0;

  // Streak rules:
  // - If user has checked in today, count today as latest streak day.
  // - If user has not checked in today but checked in yesterday, retain streak from yesterday.
  // - If user missed an entire day (neither today nor yesterday), streak resets to 0.
  // - First-ever check-in starts a streak of 1.
  if (completedDates.has(todayKey)) {
    const cursor = new Date(today);
    while (completedDates.has(formatDate(cursor))) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  } else if (completedDates.has(yesterdayKey)) {
    const cursor = new Date(yesterday);
    while (completedDates.has(formatDate(cursor))) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  } else {
    currentStreak = 0;
  }

  // Best streak across entire valid history
  const sortedDates = Array.from(completedDates).sort();
  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate = null;

  sortedDates.forEach((dateString) => {
    const [y, m, d] = dateString.split("-").map(Number);
    const currentDate = new Date(y, m - 1, d, 12, 0, 0);

    if (!previousDate) {
      runningStreak = 1;
    } else {
      const diffMs = currentDate.getTime() - previousDate.getTime();
      const differenceDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (differenceDays === 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }

    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = currentDate;
  });

  bestStreak = Math.max(bestStreak, currentStreak);

  return {
    currentStreak,
    bestStreak,
  };
};

/* =========================================================
   GET STREAK
   ========================================================= */

export const getStreakData = async (uid) => {
  if (!uid) {
    return { currentStreak: 0, bestStreak: 0 };
  }
  try {
    const records = await getWeeklyTracking(uid);
    return calculateStreakFromRecords(records);
  } catch (error) {
    console.error("Error getting streak data from Firestore:", error);
    return { currentStreak: 0, bestStreak: 0 };
  }
};

/* =========================================================
   REACTIVE DAILY TRACKING SUBSCRIPTION
   ========================================================= */

export const subscribeToDailyTracking = (uid, callback) => {
  if (!uid) return () => {};

  const trackingRef = collection(db, "users", uid, "dailyTracking");

  return onSnapshot(
    trackingRef,
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(records);
    },
    (error) => {
      console.error("Error subscribing to daily tracking:", error);
    }
  );
};


/* =========================================================
   LEGACY STREAK UPDATE
   ========================================================= */

export const updateStreak = async (
  uid,
  streak
) => {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    streak,
    lastCompletedDate: getLocalDateKey(),
  });
};

/* =========================================================
   HEALTH HISTORY
   ========================================================= */
export const addHealthHistory = async (uid, healthData) => {
  const historyRef = collection(
    db,
    "users",
    uid,
    "healthHistory"
  );

  const cleanedHealthData = Object.fromEntries(
    Object.entries(healthData).filter(
      ([, value]) => value !== undefined
    )
  );

  const document = await addDoc(historyRef, {
    ...cleanedHealthData,
    recordedAt: serverTimestamp(),
  });

  return document.id;
};

/* =========================================================
   GENERIC COLLECTION HELPERS
   ========================================================= */

export const addCollectionDocument = async (
  collectionName,
  data
) => {
  const collectionRef = collection(
    db,
    collectionName
  );

  const document = await addDoc(
    collectionRef,
    {
      ...data,
      createdAt: serverTimestamp(),
    }
  );

  return document.id;
};


export const getCollectionDocuments = async (
  collectionName
) => {
  const collectionRef = collection(
    db,
    collectionName
  );

  const snapshot = await getDocs(
    collectionRef
  );

  return snapshot.docs.map(
    (docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })
  );
};