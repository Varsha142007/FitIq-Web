import { fetchBackend } from "./apiClient";

/**
 * Engine 7 — Comprehensive Interpretation Service.
 *
 * Sends all analytics engine outputs and the user profile to the backend
 * /comprehensive-interpretation endpoint. The backend routes the data
 * through the LLM layer (Gemini / OpenAI) with a deterministic fallback.
 *
 * The LLM is NOT the analytics engine itself — it only interprets
 * the verified numerical outputs from Engines 1–6.
 *
 * @param {object} profile          - User Firestore profile
 * @param {object} fisResult        - Engine 1: FIS score + sub-scores
 * @param {object} behaviorResult   - Engine 2: Pearson correlation patterns
 * @param {object} predictionResult - Engine 3: BMI trend prediction + SHAP
 * @param {object} consistencyPrediction - Engine 3: Consistency forecast
 * @param {object} cohortResult     - Engine 4: K-Means cohort segmentation
 * @param {object} anomalyResult    - Engine 5: Anomaly + plateau detection
 * @param {object} nutritionData    - Engine 6: Nutrition targets + meal plan
 * @returns {Promise<object>}       - Structured interpretation JSON
 */
export async function getComprehensiveInterpretation({
  profile,
  fisResult,
  behaviorResult,
  predictionResult,
  consistencyPrediction,
  cohortResult,
  anomalyResult,
  nutritionData,
  today_checkin,
  latest_checkin,
  previous_checkin,
  changes,
  checkin_count,
  is_first_checkin,
  recent_history,
  cache_key,
}) {
  const activeLatest = latest_checkin || today_checkin || null;
  const payload = {
    profile: profile || {},
    engines: {
      engine1_fis: fisResult || {},
      engine2_behavior: behaviorResult || {},
      engine3_prediction: predictionResult || {},
      engine3_forecast: consistencyPrediction || {},
      engine4_cohort: cohortResult || {},
      engine5_anomaly: anomalyResult || {},
      engine6_nutrition: nutritionData || {},
    },
    // Flat fields for backward compatibility with deterministic engine
    fisResult: fisResult || {},
    behaviorResult: behaviorResult || {},
    predictionResult: predictionResult || {},
    consistencyPrediction: consistencyPrediction || {},
    cohortResult: cohortResult || {},
    anomalyResult: anomalyResult || {},
    nutritionData: nutritionData || {},
    today_checkin: activeLatest,
    latest_checkin: activeLatest,
    previous_checkin: previous_checkin || null,
    changes: changes || null,
    checkin_count: checkin_count || (recent_history?.length ?? (activeLatest ? 1 : 0)),
    is_first_checkin: is_first_checkin ?? ((checkin_count || (recent_history?.length ?? 0)) <= 1),
    recent_history: recent_history || [],
    cache_key: cache_key || null,
  };

  const response = await fetchBackend("/comprehensive-interpretation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.message || "Personalized explanation is temporarily unavailable."
    );
  }

  return response.json();
}
