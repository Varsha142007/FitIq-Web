import { useEffect, useState, useRef } from "react";
import { auth } from "../firebase/firebase";
import {
  saveDailyTracking,
  getLatestCheckInStatus
} from "../services/firestoreService";

const EMPTY_TRACKING = {
  steps: "",
  waterIntake: "",
  sleepHours: "",
  sleepQuality: "",
  exerciseMinutes: "",
  exerciseIntensity: "",
  caloriesConsumed: "",
  stressLevel: "",
  energyLevel: "",
  workoutCompleted: false
};

function formatRemainingTime(ms) {
  if (!ms || ms <= 0) return "available now";
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours} hr${hours === 1 ? "" : "s"} ${minutes} min${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function DailyTracking() {
  const [trackingData, setTrackingData] = useState(EMPTY_TRACKING);
  const [isRecorded, setIsRecorded] = useState(false);
  const [countdownText, setCountdownText] = useState("");
  const [nextAvailableDate, setNextAvailableDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const expirationTimerRef = useRef(null);

  const checkStatus = async () => {
    setLoading(true);
    setStatusError("");
    try {
      const user = auth.currentUser;

      if (!user) {
        setLoading(false);
        return;
      }

      // Check strictly against the 24-hour cycle from Firestore completion timestamp
      const status = await getLatestCheckInStatus(user.uid);

      if (status.isTracked && status.latestRecord) {
        setIsRecorded(true);
        setNextAvailableDate(status.nextAvailableAt);
        setCountdownText(formatRemainingTime(status.remainingMs));

        setTrackingData({
          steps: status.latestRecord.steps ?? "",
          waterIntake: status.latestRecord.waterIntake ?? "",
          sleepHours: status.latestRecord.sleepHours ?? "",
          sleepQuality: status.latestRecord.sleepQuality ?? "",
          exerciseMinutes: status.latestRecord.exerciseMinutes ?? "",
          exerciseIntensity: status.latestRecord.exerciseIntensity ?? "",
          caloriesConsumed: status.latestRecord.caloriesConsumed ?? "",
          stressLevel: status.latestRecord.stressLevel ?? "",
          energyLevel: status.latestRecord.energyLevel ?? "",
          workoutCompleted: Boolean(status.latestRecord.workoutCompleted)
        });

        // Set automatic expiration timer for the exact remaining duration
        if (expirationTimerRef.current) {
          clearTimeout(expirationTimerRef.current);
        }

        if (status.remainingMs > 0) {
          expirationTimerRef.current = setTimeout(() => {
            console.log("24-hour check-in period expired! Unlocking new check-in.");
            setIsRecorded(false);
            setCountdownText("");
            setNextAvailableDate(null);
            setTrackingData(EMPTY_TRACKING);
          }, status.remainingMs + 500);
        }
      } else {
        setIsRecorded(false);
        setCountdownText("");
        setNextAvailableDate(null);
        setTrackingData(EMPTY_TRACKING);
      }
    } catch (error) {
      console.error("Unable to load 24-hour check-in status:", error);
      setStatusError(
        "We couldn't verify your check-in status. Retry before submitting to avoid a duplicate check-in."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const handleUpdate = () => {
      checkStatus();
    };

    window.addEventListener("dailyTrackingUpdated", handleUpdate);
    window.addEventListener("dailyTrackingExpired", handleUpdate);

    return () => {
      window.removeEventListener("dailyTrackingUpdated", handleUpdate);
      window.removeEventListener("dailyTrackingExpired", handleUpdate);
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
      }
    };
  }, []);

  const handleChange = (event) => {
    if (isRecorded) return; // Locked during active 24-hour cycle

    const { name, value, type, checked } = event.target;

    setTrackingData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSave = async () => {
    const user = auth.currentUser;

    if (loading || statusError) {
      return;
    }

    if (!user) {
      alert("No user logged in.");
      return;
    }

    // Verify 24-hour cycle before saving
    if (isRecorded) {
      alert(
        `Your check-in is active for the current 24-hour cycle. The next check-in unlocks in ${countdownText || "a few hours"}.`
      );
      return;
    }

    if (
      trackingData.steps === "" ||
      trackingData.waterIntake === "" ||
      trackingData.sleepHours === "" ||
      trackingData.sleepQuality === "" ||
      trackingData.exerciseMinutes === "" ||
      trackingData.exerciseIntensity === "" ||
      trackingData.caloriesConsumed === "" ||
      trackingData.stressLevel === "" ||
      trackingData.energyLevel === ""
    ) {
      alert("Please complete all required daily tracking fields.");
      return;
    }

    const steps = Number(trackingData.steps);
    const waterIntake = Number(trackingData.waterIntake);
    const sleepHours = Number(trackingData.sleepHours);
    const sleepQuality = Number(trackingData.sleepQuality);
    const exerciseMinutes = Number(trackingData.exerciseMinutes);
    const caloriesConsumed = Number(trackingData.caloriesConsumed);
    const stressLevel = Number(trackingData.stressLevel);
    const energyLevel = Number(trackingData.energyLevel);

    if (
      !Number.isFinite(steps) ||
      !Number.isFinite(waterIntake) ||
      !Number.isFinite(sleepHours) ||
      !Number.isFinite(sleepQuality) ||
      !Number.isFinite(exerciseMinutes) ||
      !Number.isFinite(caloriesConsumed) ||
      !Number.isFinite(stressLevel) ||
      !Number.isFinite(energyLevel)
    ) {
      alert("Please enter valid numeric values.");
      return;
    }

    if (
      steps < 0 ||
      waterIntake < 0 ||
      sleepHours < 0 ||
      exerciseMinutes < 0 ||
      caloriesConsumed < 0
    ) {
      alert("Values cannot be negative.");
      return;
    }

    if (
      sleepQuality < 1 ||
      sleepQuality > 5 ||
      stressLevel < 1 ||
      stressLevel > 5 ||
      energyLevel < 1 ||
      energyLevel > 5
    ) {
      alert("Sleep quality, stress, and energy levels must be between 1 and 5.");
      return;
    }

    if (sleepHours > 24) {
      alert("Sleep hours cannot exceed 24 hours.");
      return;
    }

    if (waterIntake > 20) {
      alert("Please enter a realistic water intake.");
      return;
    }

    if (steps > 100000) {
      alert("Please enter a realistic step count.");
      return;
    }

    if (exerciseMinutes > 1440) {
      alert("Exercise duration cannot exceed 24 hours.");
      return;
    }

    if (!["Low", "Medium", "High"].includes(trackingData.exerciseIntensity)) {
      alert("Please select Low, Medium, or High exercise intensity.");
      return;
    }

    if (caloriesConsumed > 10000) {
      alert("Please enter a realistic calorie value.");
      return;
    }

    try {
      setSaving(true);

      // Save to Firestore with explicit completedAt serverTimestamp
      await saveDailyTracking(user.uid, {
        steps,
        waterIntake,
        sleepHours,
        sleepQuality,
        exerciseMinutes,
        exerciseIntensity: trackingData.exerciseIntensity,
        caloriesConsumed,
        stressLevel,
        energyLevel,
        workoutCompleted: Boolean(trackingData.workoutCompleted)
      });

      setIsRecorded(true);
      setCountdownText("24 hrs 0 mins");
      const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setNextAvailableDate(nextTime);

      // Start automatic expiration timer for the new 24-hour cycle
      if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
      expirationTimerRef.current = setTimeout(() => {
        setIsRecorded(false);
        setCountdownText("");
        setNextAvailableDate(null);
        setTrackingData(EMPTY_TRACKING);
      }, 24 * 60 * 60 * 1000 + 500);

      window.dispatchEvent(new Event("dailyTrackingUpdated"));
      alert("Today's tracking data saved 🎉 Next check-in unlocks in 24 hours.");
    } catch (error) {
      console.error("Unable to save daily tracking:", error);
      alert(error.message || "Unable to save today's tracking data.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-8 text-center text-gray-500">Checking your 24-hour check-in cycle...</p>;
  }

  return (
    <div>
      <h1 className="text-4xl font-bold mb-6">📅 Daily Tracking</h1>

      {statusError && (
        <div className="mb-6 max-w-xl mx-auto rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <p className="font-semibold">{statusError}</p>
          <button
            type="button"
            onClick={checkStatus}
            className="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* 24-Hour Cycle Status Banner */}
      <div className="mb-6 max-w-xl mx-auto">
        {isRecorded ? (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center shadow-xs">
            <p className="text-emerald-800 font-bold text-lg mb-1 flex items-center justify-center gap-1.5">
              <span>✓</span> Daily Check-in Tracked
            </p>
            <p className="text-emerald-700 text-sm">
              Your check-in is active for the current 24-hour cycle.
            </p>
            {countdownText && (
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                Next check-in unlocks in: <strong>{countdownText}</strong>
                {nextAvailableDate && (
                  <span> ({nextAvailableDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 text-center shadow-xs">
            <p className="text-orange-800 font-bold text-lg mb-1">
              Take Check-in
            </p>
            <p className="text-orange-700 text-sm">
              Ready for your check-in! Enter your daily metrics below to begin your next 24-hour cycle.
            </p>
          </div>
        )}
      </div>

      <div className={`bg-white p-6 rounded-2xl shadow-card max-w-xl mx-auto transition-opacity ${
        isRecorded ? "opacity-80" : "opacity-100"
      }`}>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Daily Steps</label>
        <input
          type="number"
          min="0"
          max="100000"
          name="steps"
          placeholder="Daily steps"
          value={trackingData.steps}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Water Intake (Liters)</label>
        <input
          type="number"
          min="0"
          max="20"
          step="0.1"
          name="waterIntake"
          placeholder="Water intake (litres)"
          value={trackingData.waterIntake}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sleep Hours</label>
        <input
          type="number"
          min="0"
          max="24"
          step="0.5"
          name="sleepHours"
          placeholder="Sleep hours"
          value={trackingData.sleepHours}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sleep Quality (1-5)</label>
        <input
          type="number"
          min="1"
          max="5"
          name="sleepQuality"
          placeholder="Sleep quality (1-5)"
          value={trackingData.sleepQuality}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Exercise Duration (Minutes)</label>
        <input
          type="number"
          min="0"
          max="1440"
          name="exerciseMinutes"
          placeholder="Exercise duration (minutes)"
          value={trackingData.exerciseMinutes}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Exercise Intensity</label>
        <select
          name="exerciseIntensity"
          value={trackingData.exerciseIntensity}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        >
          <option value="">Select exercise intensity</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Calories Consumed</label>
        <input
          type="number"
          min="0"
          max="10000"
          name="caloriesConsumed"
          placeholder="Calories consumed"
          value={trackingData.caloriesConsumed}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Stress Level (1-5)</label>
        <input
          type="number"
          min="1"
          max="5"
          name="stressLevel"
          value={trackingData.stressLevel}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-3 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Energy Level (1-5)</label>
        <input
          type="number"
          min="1"
          max="5"
          name="energyLevel"
          value={trackingData.energyLevel}
          onChange={handleChange}
          disabled={isRecorded}
          className="w-full border p-3 rounded-xl mb-4 disabled:bg-gray-50 disabled:text-gray-700"
        />

        <label className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            name="workoutCompleted"
            checked={trackingData.workoutCompleted}
            onChange={handleChange}
            disabled={isRecorded}
          />
          <span className="text-sm font-medium text-gray-700">Workout completed today</span>
        </label>

        <button
          onClick={handleSave}
          disabled={saving || loading || isRecorded || Boolean(statusError)}
          className={`w-full py-3.5 rounded-xl font-semibold transition shadow-sm ${
            isRecorded
              ? "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300"
              : "bg-primary text-white hover:bg-orange-700"
          }`}
        >
          {saving
            ? "Saving..."
            : isRecorded
            ? `Next Check-in Available in ${countdownText || "24 hrs"}`
            : "Save Check-in Data"}
        </button>
      </div>
    </div>
  );
}

export default DailyTracking;
