import { fetchBackend } from "./apiClient";
export const prepareFisInput = (profile, trackingRecords) => {

let fisGoal = null;

if (profile?.goal === "Weight Loss") {
  fisGoal = "lose";
} else if (profile?.goal === "Muscle Gain") {
  fisGoal = "gain";
} else if (profile?.goal === "Maintain Fitness") {
  fisGoal = "maintain";
}
const recentTrackingRecords = (trackingRecords || []).slice(-7);
const convertEnergyLevel = (energyLevel) => {
  if (energyLevel === null || energyLevel === undefined) {
    return null;
  }

  if (energyLevel <= 2) {
    return "Low";
  } else if (energyLevel === 3) {
    return "Medium";
  } else {
    return "High";
  }
};


const exerciseDays = recentTrackingRecords.filter(
  (record) =>
    record?.workoutCompleted === true ||
    Number(record?.exerciseMinutes || 0) > 0
).length;
const exerciseDurations = recentTrackingRecords
  .map((record) => Number(record?.exerciseMinutes))
  .filter((minutes) => !isNaN(minutes) && minutes >= 0);

const averageExerciseDuration =
  exerciseDurations.length > 0
    ? exerciseDurations.reduce((sum, minutes) => sum + minutes, 0) /
      exerciseDurations.length
    : null;


    const stepValues = recentTrackingRecords
  .map((record) => Number(record?.steps))
  .filter((steps) => !isNaN(steps) && steps >= 0);

const averageSteps =
  stepValues.length > 0
    ? stepValues.reduce((sum, steps) => sum + steps, 0) / stepValues.length
    : null;

   const sleepValues = recentTrackingRecords
  .map((record) => Number(record?.sleepHours))
  .filter((hours) => !isNaN(hours) && hours >= 0);

const averageSleepHours =
  sleepValues.length > 0
    ? sleepValues.reduce((sum, hours) => sum + hours, 0) / sleepValues.length
    : null;

    const waterValues = recentTrackingRecords
  .map((record) => Number(record?.waterIntake))
  .filter((liters) => !isNaN(liters) && liters >= 0);

const averageWaterIntake =
  waterValues.length > 0
    ? waterValues.reduce((sum, liters) => sum + liters, 0) / waterValues.length
    : null;

    const dailyConsistency = recentTrackingRecords.map((record) => {
  const stepsMet = Number(record?.steps || 0) >= 7500;

  const exerciseMet =
    record?.workoutCompleted === true ||
    Number(record?.exerciseMinutes || 0) >= 30;

  const sleepMet =
    Number(record?.sleepHours || 0) >= 7;

  const hydrationMet =
    Number(record?.waterIntake || 0) >= 2;

  const completedBehaviors = [
    stepsMet,
    exerciseMet,
    sleepMet,
    hydrationMet
  ].filter(Boolean).length;

  return completedBehaviors >= 3;
});

 return {
  profile: {
    weight: profile?.weight ?? null,
    previousWeight: null,
    goal: fisGoal,
    bmi: profile?.bodyAnalysis?.bmi ?? null,
    mealsPerDay: profile?.healthAssessment?.mealsPerDay ?? null,
    exerciseDays,
    averageExerciseDuration,
    averageSteps,
    averageSleepHours,
    averageWaterIntake,
    dailyConsistency,
  },

  trackingRecords: recentTrackingRecords.map((record) => ({
    date: record?.id ?? null,
    steps: record?.steps ?? null,
    exerciseMinutes: record?.exerciseMinutes ?? null,
    exerciseIntensity: record?.exerciseIntensity ?? null,
    sleepHours: record?.sleepHours ?? null,
    waterIntake: record?.waterIntake ?? null,
    energyLevel: convertEnergyLevel(record?.energyLevel),
    stressLevel: record?.stressLevel ?? null,
    workoutCompleted: record?.workoutCompleted ?? false
  }))
};}
export const calculateFis = async (fisInput) => {
  const response = await fetchBackend("/fis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fisInput),
  });

  if (!response.ok) {
    throw new Error("Failed to calculate FIS");
  }

  return await response.json();
};