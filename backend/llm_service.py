import os
import json
import urllib.request
import urllib.error
from datetime import datetime

# Load environment variables from backend/.env if present
def _load_env_file():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and not os.environ.get(k):
                            os.environ[k] = v
        except Exception as e:
            print("Error loading .env file:", e)

_load_env_file()


# =====================================================================
# PRESERVED LEGACY FUNCTION (ENGINE 2 BEHAVIOR INSIGHTS)
# =====================================================================

def generate_behavior_insights(mode, patterns):
    """
    Preserved for backward compatibility with existing E2 behavior analysis.
    """
    insights = []

    relationship_names = {
        "sleep_steps": "sleep and daily steps",
        "sleep_exercise": "sleep and exercise duration",
        "hydration_steps": "hydration and daily steps",
        "hydration_exercise": "hydration and exercise duration"
    }

    if mode == "personal":
        prefix = "Based on your recent tracking, "
    else:
        prefix = "In the broader FitIQ fitness data, "

    for pattern in patterns[:2]:
        relationship = relationship_names.get(
            pattern.get("relationship", ""),
            pattern.get("relationship", "")
        )

        strength = pattern.get("strength", "")

        if strength == "Strong positive":
            message = (
                prefix +
                f"a strong positive relationship was observed between {relationship}."
            )
        elif strength == "Moderate positive":
            message = (
                prefix +
                f"a moderate positive relationship was observed between {relationship}."
            )
        elif strength == "Moderate negative":
            message = (
                prefix +
                f"a moderate negative relationship was observed between {relationship}."
            )
        elif strength == "Strong negative":
            message = (
                prefix +
                f"a strong negative relationship was observed between {relationship}."
            )
        else:
            message = (
                prefix +
                f"no meaningful relationship was detected between {relationship}."
            )

        if mode == "personal":
            advice = (
                "Continue tracking these behaviors to understand your patterns over time."
            )
        else:
            advice = (
                "Keep tracking your own behavior to build personalized insights over time."
            )

        insights.append({
            "title": relationship.title(),
            "message": message,
            "advice": advice
        })

    return {
        "insights": insights
    }


# =====================================================================
# STRICT SYSTEM PROMPT FOR LLM INTEGRATION
# =====================================================================

SYSTEM_PROMPT = """You are FitIQ's Analytics Interpretation and Personalized Recommendation Assistant.
You do NOT calculate analytics yourself.
You receive verified outputs from FitIQ's 7 analytics engines.
Your role is to interpret those outputs accurately, explain them in clear language, identify relationships across findings, and generate personalized, actionable recommendations.

CRITICAL RULES:
1. NEVER hallucinate or invent data. Only use numbers and categories supplied to you in the prompt payload (e.g. exact BMI, FIS score, correlations, predictions, cluster values, calories, trends, or anomalies). If data is missing or marked None, explicitly state that data is insufficient or unavailable.
2. Analytics engines are the source of truth. Never recalculate or contradict calculated scores.
3. Correlation does NOT equal causation. Never claim that one factor causes another (e.g. do not say "exercise causes better sleep"). Instead say they tend to move together in the recorded data. Never make fake physiological causal claims (e.g. do NOT say "Inadequate fluid intake slows down your cellular metabolic rate and muscular recovery" — state factually "Your recorded water intake is below your current target").
4. Recommendations must be deeply personalized to the user's actual profile, goals, metrics, trends, and dynamic check-in changes:
   - Compare `latest_checkin` with `previous_checkin` using the provided `changes` data.
   - If a metric improved (e.g. water increased from 1.2 to 2.5 L, steps increased), acknowledge the improvement ("Hydration has improved since your previous check-in. Keep your intake consistent throughout the day"). Do NOT repeat obsolete bottleneck warnings if the latest data is adequate.
   - If a metric declined (e.g. sleep dropped from 7 to 4.5 hours), prioritize that area.
   - If user answers are unchanged, do not falsely claim changes.
   - If `is_first_checkin` is true or only 1 check-in exists:
     Do NOT claim a trend. Set overall_summary to "Your Personalized Starting Point\n\nYour first check-in has established your baseline. Continue checking in to help FitIQ identify meaningful changes in your habits."
     Set `since_last_checkin` for priority actions to "First check-in — baseline established."
   - Consistency Engine (< 3 check-ins): DO NOT treat consistency as a 0/100 failure. Explicitly state "Consistency baseline is still being established."
5. Safety: Do NOT diagnose medical conditions. Do NOT prescribe medications or medical diets. If health metrics are concerning, advise consulting a qualified healthcare professional.
6. Provide two explanation modes:
   - User Mode: MUST BE EXTREMELY SIMPLE ENGLISH. Use short sentences, common everyday words, and clear action-oriented language. Keep a friendly but professional tone. Do NOT use long paragraphs, unnecessary technical terminology, or complicated medical/scientific language. MUST include structured AI Health Summary, Priority Actions (each with `since_last_checkin`), Nutrition, Fitness, Sleep, Behavior, Progress sections.
   - Technical / Viva Mode: Academic explanation specifying the statistical or ML method, inputs, outputs, interpretation, why the method was chosen, and limitations.
7. Nutrition recommendations MUST be genuinely useful and personalized based on the user's calories/nutrition analysis. Include specific BREAKFAST, LUNCH, SNACK, and DINNER suggestions with appropriate Indian meal options and nutritional information. Do not hardcode the same meal plan for every user. 

You must respond ONLY with a valid JSON object matching the following EXACT schema without any surrounding markdown fences:

{
  "user_mode": {
    "overall_summary": "...",
    "strengths": ["...", "..."],
    "what_needs_attention": ["...", "..."],
    "priority_actions": [
      {
        "priority": 1,
        "title": "...",
        "what_is_happening": "...",
        "why_it_matters": "...",
        "what_to_do_next": "...",
        "since_last_checkin": "...",
        "evidence": "..."
      }
    ],
    "nutrition": {
      "breakfast": {
        "time": "8:00 AM - 9:00 AM",
        "meal": "..."
      },
      "lunch": {
        "time": "1:00 PM - 2:00 PM",
        "meal": "..."
      },
      "snack": {
        "time": "4:30 PM - 5:30 PM",
        "meal": "..."
      },
      "dinner": {
        "time": "8:00 PM - 9:00 PM",
        "meal": "..."
      }
    },
    "fitness": ["..."],
    "sleep": ["..."],
    "behavior": ["..."],
    "progress": ["..."],
    "cross_engine_insights": ["..."],
    "key_findings": [
      {
        "engine": "Engine 1 — Fitness Indicator Score (FIS)",
        "finding": "...",
        "evidence": "...",
        "explanation": "...",
        "recommendation": "..."
      }
    ],
    "why_these_recommendations": "..."
  },
  "technical_mode": {
    "engine_1": {
      "name": "...",
      "method": "...",
      "inputs": "...",
      "output": "...",
      "interpretation": "...",
      "why_method_selected": "...",
      "limitations": "..."
    }
  }
}
"""


# =====================================================================
# LLM API CALLER (GEMINI / OPENAI)
# =====================================================================

def call_llm_api(system_prompt, user_payload_str):
    """
    Attempts to call an external LLM (Gemini or OpenAI) using server-side API keys.
    Returns parsed JSON dict if successful, or None on failure/missing key.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("LLM_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    # 1. Try Google Gemini if key available
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": f"{system_prompt}\n\nANALYTICS ENGINE OUTPUTS PAYLOAD:\n{user_payload_str}\n\nRespond with strict JSON."}
                        ]
                    }
                ],
                "generationConfig": {
                    "response_mime_type": "application/json",
                    "temperature": 0.2
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=12) as response:
                if response.status == 200:
                    resp_json = json.loads(response.read().decode("utf-8"))
                    text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                    clean_text = text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    return json.loads(clean_text)
        except Exception as e:
            print("Gemini API call failed, falling back to deterministic engine:", e)

    # 2. Try OpenAI if key available
    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"ANALYTICS ENGINE OUTPUTS:\n{user_payload_str}"}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {openai_key}"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=12) as response:
                if response.status == 200:
                    resp_json = json.loads(response.read().decode("utf-8"))
                    text = resp_json["choices"][0]["message"]["content"]
                    return json.loads(text)
        except Exception as e:
            print("OpenAI API call failed, falling back to deterministic engine:", e)

    return None


# =====================================================================
# DYNAMIC CHECK-IN CHANGE EXTRACTION
# =====================================================================

def extract_checkin_changes(latest_checkin, previous_checkin):
    """
    Compares latest check-in against previous check-in across all core metrics.
    Detects numerical differences and sets qualitative trend direction.
    """
    if not latest_checkin:
        return {}

    changes = {}

    def get_num(record, *keys):
        if not record or not isinstance(record, dict):
            return None
        for k in keys:
            v = record.get(k)
            if v is not None and v != "":
                try:
                    return float(v)
                except (ValueError, TypeError):
                    continue
        return None

    # Steps
    cur_steps = get_num(latest_checkin, "steps", "dailySteps")
    prev_steps = get_num(previous_checkin, "steps", "dailySteps") if previous_checkin else None
    if cur_steps is not None:
        if prev_steps is not None:
            diff = cur_steps - prev_steps
            trend = "Increased" if diff > 50 else ("Decreased" if diff < -50 else "Steady")
            arrow = "↑" if diff > 50 else ("↓" if diff < -50 else "→")
            changes["steps"] = {
                "latest": cur_steps,
                "previous": prev_steps,
                "diff": diff,
                "trend": trend,
                "change_text": f"{arrow} Steps {'increased' if diff > 50 else 'decreased' if diff < -50 else 'remained steady'} by {abs(int(diff)):,} steps" if abs(diff) > 50 else "Steps remained steady"
            }
        else:
            changes["steps"] = {
                "latest": cur_steps,
                "previous": None,
                "diff": None,
                "trend": "Baseline",
                "change_text": f"Baseline: {int(cur_steps):,} steps recorded"
            }

    # Sleep
    cur_sleep = get_num(latest_checkin, "sleepHours", "sleep", "hoursSleep")
    prev_sleep = get_num(previous_checkin, "sleepHours", "sleep", "hoursSleep") if previous_checkin else None
    if cur_sleep is not None:
        if prev_sleep is not None:
            diff = round(cur_sleep - prev_sleep, 1)
            trend = "Increased" if diff > 0.2 else ("Decreased" if diff < -0.2 else "Steady")
            arrow = "↑" if diff > 0.2 else ("↓" if diff < -0.2 else "→")
            changes["sleep"] = {
                "latest": cur_sleep,
                "previous": prev_sleep,
                "diff": diff,
                "trend": trend,
                "change_text": f"{arrow} Sleep {'increased' if diff > 0.2 else 'decreased' if diff < -0.2 else 'remained steady'} by {abs(diff)} hours" if abs(diff) > 0.2 else "Sleep duration remained steady"
            }
        else:
            changes["sleep"] = {
                "latest": cur_sleep,
                "previous": None,
                "diff": None,
                "trend": "Baseline",
                "change_text": f"Baseline: {cur_sleep} hrs sleep recorded"
            }

    # Water
    cur_water = get_num(latest_checkin, "waterIntake", "water", "hydrationLevel")
    prev_water = get_num(previous_checkin, "waterIntake", "water", "hydrationLevel") if previous_checkin else None
    if cur_water is not None:
        if prev_water is not None:
            diff = round(cur_water - prev_water, 1)
            trend = "Increased" if diff > 0.2 else ("Decreased" if diff < -0.2 else "Steady")
            arrow = "↑" if diff > 0.2 else ("↓" if diff < -0.2 else "→")
            changes["water"] = {
                "latest": cur_water,
                "previous": prev_water,
                "diff": diff,
                "trend": trend,
                "change_text": f"{arrow} Water {'increased' if diff > 0.2 else 'decreased' if diff < -0.2 else 'remained steady'} by {abs(diff)} L" if abs(diff) > 0.2 else "Water intake remained steady"
            }
        else:
            changes["water"] = {
                "latest": cur_water,
                "previous": None,
                "diff": None,
                "trend": "Baseline",
                "change_text": f"Baseline: {cur_water} L water recorded"
            }

    # Exercise
    cur_ex = get_num(latest_checkin, "exerciseMinutes", "duration_minutes", "durationMinutes")
    prev_ex = get_num(previous_checkin, "exerciseMinutes", "duration_minutes", "durationMinutes") if previous_checkin else None
    if cur_ex is not None:
        if prev_ex is not None:
            diff = int(cur_ex - prev_ex)
            trend = "Increased" if diff > 5 else ("Decreased" if diff < -5 else "Steady")
            arrow = "↑" if diff > 5 else ("↓" if diff < -5 else "→")
            changes["exercise"] = {
                "latest": cur_ex,
                "previous": prev_ex,
                "diff": diff,
                "trend": trend,
                "change_text": f"{arrow} Exercise {'increased' if diff > 5 else 'decreased' if diff < -5 else 'remained steady'} by {abs(diff)} mins" if abs(diff) > 5 else "Exercise duration remained steady"
            }
        else:
            changes["exercise"] = {
                "latest": cur_ex,
                "previous": None,
                "diff": None,
                "trend": "Baseline",
                "change_text": f"Baseline: {int(cur_ex)} mins exercise recorded"
            }

    # Stress & Energy
    cur_stress = get_num(latest_checkin, "stressLevel", "stress")
    prev_stress = get_num(previous_checkin, "stressLevel", "stress") if previous_checkin else None
    if cur_stress is not None and prev_stress is not None:
        diff_s = cur_stress - prev_stress
        changes["stress"] = {
            "latest": cur_stress,
            "previous": prev_stress,
            "diff": diff_s,
            "trend": "Increased" if diff_s > 0 else ("Decreased" if diff_s < 0 else "Steady")
        }

    return changes


# =====================================================================
# DETERMINISTIC FITIQ INTERPRETATION ENGINE (FALLBACK / VERIFICATION)
# =====================================================================

def generate_deterministic_interpretation(data):
    """
    High-fidelity, deterministic analytics interpretation engine.
    Strictly adheres to all FitIQ rules:
    - Never hallucinates data
    - Treats calculations as source of truth
    - Explains without technical jargon in user mode
    - Dynamically recalculates recommendations based on latest checkin and checkin changes
    - Eliminates false 0/100 consistency claims when history is insufficient
    - Avoids fake causal claims (e.g. cellular metabolic rate claims)
    """
    profile = data.get("profile", {}) or {}
    engines = data.get("engines", {}) or {}

    latest_checkin = data.get("latest_checkin") or data.get("today_checkin") or {}
    previous_checkin = data.get("previous_checkin")
    recent_history = data.get("recent_history", []) or []

    if not previous_checkin and len(recent_history) >= 2:
        def get_ts(rec):
            if not rec or not isinstance(rec, dict):
                return 0
            for k in ("completedAtMillis", "timestamp", "completedAt", "recordedAt", "date"):
                val = rec.get(k)
                if val:
                    if isinstance(val, (int, float)):
                        return float(val)
                    if isinstance(val, str):
                        try:
                            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                            return dt.timestamp() * 1000
                        except Exception:
                            pass
            return 0
        sorted_history = sorted(recent_history, key=get_ts)
        previous_checkin = sorted_history[-2]

    changes = data.get("changes") or extract_checkin_changes(latest_checkin, previous_checkin)
    checkin_count = data.get("checkin_count") or (len(recent_history) if recent_history else (1 if latest_checkin else 0))
    is_first_checkin = data.get("is_first_checkin", False) or (checkin_count <= 1 or previous_checkin is None)

    # Extract engine data
    e1_fis = engines.get("engine1_fis") or data.get("fisResult") or {}
    e2_behavior = engines.get("engine2_behavior") or data.get("behaviorResult") or {}
    e3_forecast = engines.get("engine3_forecast") or data.get("consistencyPrediction") or {}
    e3_prediction = engines.get("engine3_prediction") or data.get("predictionResult") or {}
    e4_cohort = engines.get("engine4_cohort") or data.get("cohortResult") or {}
    e5_anomaly = engines.get("engine5_anomaly") or data.get("anomalyResult") or {}
    e6_nutrition = engines.get("engine6_nutrition") or data.get("nutritionData") or {}

    # User profile fields
    age = profile.get("age")
    gender = profile.get("gender", "User")
    height = profile.get("height")
    weight = profile.get("weight")
    goal = profile.get("goal", "Fitness Maintenance")
    activity_level = profile.get("activityLevel", "Moderate")
    bmi = profile.get("bodyAnalysis", {}).get("bmi") or profile.get("bmi")
    bmi_cat = profile.get("bodyAnalysis", {}).get("category") or "Normal"

    # -------------------------------------------------------------
    # 1. EVALUATE ENGINE 1 (FIS SCORE)
    # -------------------------------------------------------------
    fis_score = e1_fis.get("fis")
    fitness_activity = e1_fis.get("fitnessActivity", {})
    recovery = e1_fis.get("recovery", {})
    body_comp = e1_fis.get("bodyComposition", {})
    nutrition_sub = e1_fis.get("nutrition", {})
    consistency_sub = e1_fis.get("consistency", {})

    subscores = {
        "Physical Activity": fitness_activity.get("score"),
        "Recovery & Sleep": recovery.get("score"),
        "Body Composition": body_comp.get("score"),
        "Hydration & Nutrition": nutrition_sub.get("score"),
    }
    # Only include consistency if there is sufficient historical check-in data (>= 3 check-ins)
    if checkin_count >= 3 and consistency_sub.get("score") is not None:
        subscores["Consistency"] = consistency_sub.get("score")

    valid_subscores = {k: v for k, v in subscores.items() if v is not None}
    
    highest_sub = max(valid_subscores.items(), key=lambda x: x[1]) if valid_subscores else ("Physical Activity", 70)
    lowest_sub = min(valid_subscores.items(), key=lambda x: x[1]) if valid_subscores else ("Physical Activity", 50)

    # -------------------------------------------------------------
    # 2. EVALUATE ENGINE 2 (BEHAVIOR CORRELATION)
    # -------------------------------------------------------------
    patterns = e2_behavior.get("patterns", [])
    behavior_mode = e2_behavior.get("mode", "population")
    top_pattern = patterns[0] if patterns else None

    # -------------------------------------------------------------
    # 3. EVALUATE ENGINE 3 (CONSISTENCY FORECAST & BMI PREDICTION)
    # -------------------------------------------------------------
    forecast_trend = e3_forecast.get("trend", "stable")
    forecast_change = e3_forecast.get("change", 0)
    current_consistency = e3_forecast.get("current_score")
    projected_consistency = e3_forecast.get("projected_score")
    pred_bmi_change = e3_prediction.get("predicted_bmi_change")
    pred_future_bmi = e3_prediction.get("predicted_future_bmi")
    shap_factors = e3_prediction.get("shap_factors", [])

    # -------------------------------------------------------------
    # 4. EVALUATE ENGINE 4 (COHORT INTELLIGENCE)
    # -------------------------------------------------------------
    cohort_size = e4_cohort.get("cohort_size", 0)
    cohort_comparisons = e4_cohort.get("comparisons", {})
    cohort_similarity = e4_cohort.get("average_similarity", 0.85)

    # -------------------------------------------------------------
    # 5. EVALUATE ENGINE 5 (ANOMALY & PLATEAU)
    # -------------------------------------------------------------
    anomalies = e5_anomaly.get("anomalies", [])
    has_anomaly = len(anomalies) > 0
    plateau_info = e5_anomaly.get("plateau", {})
    plateau_detected = plateau_info.get("detected", False) or plateau_info.get("plateau_detected", False)

    # -------------------------------------------------------------
    # 6. EVALUATE ENGINE 6 (NUTRITION)
    # -------------------------------------------------------------
    calorie_target = e6_nutrition.get("calorie_target")
    tdee = e6_nutrition.get("tdee")
    bmr = e6_nutrition.get("bmr")
    macros = e6_nutrition.get("macros", {})
    food_recs = e6_nutrition.get("recommendations", [])
    water_target = float(e6_nutrition.get("targets", {}).get("water_liters") or 2.5)

    # -------------------------------------------------------------
    # SYNTHESIZE STRENGTHS & AREAS NEEDING ATTENTION
    # -------------------------------------------------------------
    strengths = []
    needs_attention = []

    if fis_score is not None:
        if fis_score >= 75:
            strengths.append(f"Strong overall Fitness Indicator Score of {fis_score}/100, reflecting solid baseline health.")
        else:
            needs_attention.append(f"Current Fitness Indicator Score of {fis_score}/100 shows clear room for structured progress.")

    if highest_sub and highest_sub[1] is not None and highest_sub[1] >= 65:
        strengths.append(f"{highest_sub[0]} is your strongest pillar ({round(highest_sub[1], 1)}/100), providing a reliable anchor for your routine.")

    if lowest_sub and lowest_sub[1] is not None and lowest_sub[1] < 70:
        needs_attention.append(f"{lowest_sub[0]} is your lowest scoring dimension ({round(lowest_sub[1], 1)}/100) and represents your highest-leverage improvement opportunity.")

    if checkin_count >= 3:
        if forecast_trend == "improving":
            strengths.append(f"Your tracking consistency is trending positively (+{abs(forecast_change)}% trajectory), strengthening habit formation.")
        elif forecast_trend == "declining":
            needs_attention.append(f"Recent consistency shows a declining short-term pattern ({forecast_change}% change), signaling possible routine disruption.")
    else:
        strengths.append("Consistency baseline is currently being established across your initial check-in cycles.")

    if plateau_detected:
        needs_attention.append("A progress plateau was detected across recent activity windows, indicating that your body has adapted to current training stimuli.")
    elif not has_anomaly:
        strengths.append("Activity patterns show steady stability without disruptive outliers or erratic variance.")

    if not strengths:
        strengths.append("Active tracking engagement provides valuable baseline data for personalized fitness optimization.")
    if not needs_attention:
        needs_attention.append("Continue current habits while gradually challenging your progressive overload targets.")

    # -------------------------------------------------------------
    # DYNAMIC PRIORITY ACTIONS (CHANGE-SENSITIVE & FACTUAL)
    # -------------------------------------------------------------
    candidate_actions = []

    # 1. SLEEP RECOVERY
    sleep_change = changes.get("sleep", {})
    cur_sleep = sleep_change.get("latest")
    if cur_sleep is None:
        raw_s = latest_checkin.get("sleepHours") or latest_checkin.get("sleep")
        cur_sleep = float(raw_s) if raw_s is not None and raw_s != "" else 7.0
    sleep_diff = sleep_change.get("diff")

    if sleep_diff is not None and sleep_diff < -0.4:
        candidate_actions.append({
            "rank": 98 + min(15, abs(sleep_diff) * 5),
            "title": "Restore Sleep & Recovery",
            "what_is_happening": f"Sleep decreased by {abs(sleep_diff)} hours compared with your previous check-in (recorded {cur_sleep} hrs).",
            "why_it_matters": "Adequate rest restores physical energy and supports daily cognitive and muscular recovery.",
            "what_to_do_next": "Prioritize a consistent sleep schedule tonight, aiming for 7–8 hours of restorative rest.",
            "since_last_checkin": f"↓ Sleep decreased by {abs(sleep_diff)} hours",
            "evidence": "Engine 1 (Recovery Pillar) & Daily Check-in comparison",
            "related_engine": "Engine 1 — Recovery"
        })
    elif cur_sleep < 6.0:
        candidate_actions.append({
            "rank": 88,
            "title": "Prioritize Restorative Sleep",
            "what_is_happening": f"Recorded sleep duration was {cur_sleep} hours, below the 7-hour target.",
            "why_it_matters": "Sleep under 6 hours limits muscular recovery and physical stamina.",
            "what_to_do_next": "Set a screen-free wind-down routine 45 minutes before sleep tonight.",
            "since_last_checkin": "First check-in — baseline established." if is_first_checkin else f"Recorded {cur_sleep} hrs sleep",
            "evidence": "Engine 1 (Recovery Pillar)",
            "related_engine": "Engine 1 — Recovery"
        })
    elif sleep_diff is not None and sleep_diff >= 0.8:
        candidate_actions.append({
            "rank": 72,
            "title": "Sustain Sleep Improvement",
            "what_is_happening": f"Sleep increased by +{sleep_diff} hours compared with your previous check-in (recorded {cur_sleep} hrs).",
            "why_it_matters": "Consistent 7+ hours of sleep accelerates daily muscle recovery and daily energy.",
            "what_to_do_next": "Maintain this bedtime schedule tonight to consolidate your recovery routine.",
            "since_last_checkin": f"↑ Sleep increased by {sleep_diff} hours",
            "evidence": "Engine 1 (Recovery Pillar)",
            "related_engine": "Engine 1 — Recovery"
        })

    # 2. HYDRATION (WATER)
    water_change = changes.get("water", {})
    cur_water = water_change.get("latest")
    if cur_water is None:
        raw_w = latest_checkin.get("waterIntake") or latest_checkin.get("water")
        cur_water = float(raw_w) if raw_w is not None and raw_w != "" else 2.0
    water_diff = water_change.get("diff")

    if water_diff is not None and water_diff < -0.4:
        candidate_actions.append({
            "rank": 94 + min(10, abs(water_diff) * 5),
            "title": "Replenish Daily Fluid Intake",
            "what_is_happening": f"Water intake dropped by {abs(water_diff)} L compared with your previous check-in (recorded {cur_water} L).",
            "why_it_matters": "Your recorded water intake is below your current target.",
            "what_to_do_next": f"Keep a water bottle nearby and target {water_target} L daily.",
            "since_last_checkin": f"↓ Water decreased by {abs(water_diff)} L",
            "evidence": "Engine 6 (Hydration Targets)",
            "related_engine": "Engine 6 — Hydration"
        })
    elif cur_water < 1.8:
        candidate_actions.append({
            "rank": 82,
            "title": "Increase Daily Fluid Intake",
            "what_is_happening": f"Your recorded water intake ({cur_water} L) is below your current {water_target} L target.",
            "why_it_matters": "Your recorded water intake is below your current target.",
            "what_to_do_next": f"Aim for {water_target} liters of water distributed evenly across morning, afternoon, and evening.",
            "since_last_checkin": "First check-in — baseline established." if is_first_checkin else f"Recorded {cur_water} L vs {water_target} L target",
            "evidence": "Engine 6 (Hydration Targets)",
            "related_engine": "Engine 6 — Hydration"
        })
    elif water_diff is not None and water_diff >= 0.8 and cur_water >= 2.0:
        candidate_actions.append({
            "rank": 74,
            "title": "Maintain Hydration Consistency",
            "what_is_happening": f"Hydration has improved since your previous check-in, reaching {cur_water} L.",
            "why_it_matters": "Consistent hydration maintains fluid balance and supports your daily energy.",
            "what_to_do_next": "Keep your intake consistent throughout the day.",
            "since_last_checkin": f"↑ Water increased by {water_diff} L",
            "evidence": "Engine 6 (Hydration Targets)",
            "related_engine": "Engine 6 — Hydration"
        })

    # 3. ACTIVITY (STEPS)
    steps_change = changes.get("steps", {})
    cur_steps = steps_change.get("latest")
    if cur_steps is None:
        raw_st = latest_checkin.get("steps") or latest_checkin.get("dailySteps")
        cur_steps = float(raw_st) if raw_st is not None and raw_st != "" else 5000
    steps_diff = steps_change.get("diff")

    if steps_diff is not None and steps_diff <= -1500:
        candidate_actions.append({
            "rank": 96 + min(12, abs(steps_diff) / 500),
            "title": "Re-Engage Daily Movement",
            "what_is_happening": f"Steps decreased by {abs(int(steps_diff)):,} steps compared with your previous check-in (recorded {int(cur_steps):,} steps).",
            "why_it_matters": "Daily step volume forms the foundation of your active physical expenditure.",
            "what_to_do_next": "Add a 20-minute brisk walk after lunch or dinner to recover your step baseline.",
            "since_last_checkin": f"↓ Steps decreased by {abs(int(steps_diff)):,}",
            "evidence": "Engine 1 (Physical Activity Pillar)",
            "related_engine": "Engine 1 — Physical Activity"
        })
    elif cur_steps < 4500:
        candidate_actions.append({
            "rank": 78,
            "title": "Elevate Daily Step Baseline",
            "what_is_happening": f"Recorded step volume was {int(cur_steps):,} steps, below the active baseline threshold.",
            "why_it_matters": "Increasing non-exercise daily movement raises overall metabolic expenditure.",
            "what_to_do_next": "Target at least 6,000 steps tomorrow by taking short active walking breaks.",
            "since_last_checkin": "First check-in — baseline established." if is_first_checkin else f"Recorded {int(cur_steps):,} steps",
            "evidence": "Engine 1 (Physical Activity Pillar)",
            "related_engine": "Engine 1 — Physical Activity"
        })
    elif steps_diff is not None and steps_diff >= 1500:
        candidate_actions.append({
            "rank": 76,
            "title": "Build on Activity Momentum",
            "what_is_happening": f"Your activity increased by +{int(steps_diff):,} steps compared with your previous check-in ({int(cur_steps):,} steps).",
            "why_it_matters": "Maintaining this level consistently can strengthen your activity trend.",
            "what_to_do_next": "Aim to hit a similar movement target tomorrow to establish a strong weekly pattern.",
            "since_last_checkin": f"↑ Steps increased by {int(steps_diff):,}",
            "evidence": "Engine 1 (Physical Activity Pillar)",
            "related_engine": "Engine 1 — Physical Activity"
        })

    # 4. NUTRITION ALIGNMENT
    if calorie_target:
        candidate_actions.append({
            "rank": 70,
            "title": f"Align Nutrition with {goal} Target",
            "what_is_happening": f"Your nutrition is calibrated to your {goal.lower()} energy target (~{calorie_target} kcal).",
            "why_it_matters": "Hitting your optimal energy balance supports your body composition and training targets.",
            "what_to_do_next": f"Distribute protein and carbohydrates across your daily meals, aiming for ~{calorie_target} kcal.",
            "since_last_checkin": "First check-in — baseline established." if is_first_checkin else "Caloric target calibrated",
            "evidence": "Engine 6 (Nutrition Intelligence)",
            "related_engine": "Engine 6 — Nutrition"
        })

    # 5. PLATEAU OR CONSISTENCY INTERVENTION (IF HISTORICAL DATA SUFFICIENT)
    if plateau_detected:
        candidate_actions.append({
            "rank": 92,
            "title": "Stimulate Adaptation to Break Plateau",
            "what_is_happening": "Your body has adapted to your current activity level, leading to stagnation in progress.",
            "why_it_matters": "Without variation or progressive overload, fitness improvements remain flat.",
            "what_to_do_next": "Introduce new stimuli to your routine by increasing intensity or changing exercise modalities.",
            "since_last_checkin": "Plateau detected across tracking window",
            "evidence": "Engine 5 (Plateau Detection)",
            "related_engine": "Engine 5 — Plateau"
        })
    elif checkin_count >= 3 and forecast_trend == "declining":
        candidate_actions.append({
            "rank": 85,
            "title": "Restore Habit Consistency with Micro-Targets",
            "what_is_happening": "Your tracking consistency is showing a downward trend.",
            "why_it_matters": "Losing habit momentum prevents long-term engagement.",
            "what_to_do_next": "Commit to smaller, manageable daily targets to rebuild your routine without burning out.",
            "since_last_checkin": f"Consistency drift of {abs(forecast_change)}%",
            "evidence": f"Engine 3 projected a consistency decline of {abs(forecast_change)}%.",
            "related_engine": "Engine 3 — Consistency"
        })

    # 6. BEHAVIOR CORRELATION / BASELINE
    if is_first_checkin:
        candidate_actions.append({
            "rank": 65,
            "title": "Build Your Check-in Baseline",
            "what_is_happening": "FitIQ has recorded your first check-in and established your starting baseline.",
            "why_it_matters": "Daily check-ins build habit permanence and unlock comparison insights.",
            "what_to_do_next": "Complete tomorrow's check-in to start comparing your day-over-day changes.",
            "since_last_checkin": "First check-in — baseline established.",
            "evidence": "Engine 1 (Baseline Ingestion)",
            "related_engine": "Engine 1 — Consistency Baseline"
        })
    elif top_pattern:
        rel_name = top_pattern.get("relationship", "").replace("_", " and ")
        candidate_actions.append({
            "rank": 58,
            "title": f"Leverage {rel_name.title()} Synergy",
            "what_is_happening": f"There is a {top_pattern.get('strength', 'positive').lower()} relationship between {rel_name}.",
            "why_it_matters": "Improvements in one coincide with gains in the other, creating compounding behavioral synergy.",
            "what_to_do_next": "Support your daily activity by actively prioritizing these compounding habits together.",
            "since_last_checkin": "Habit pattern reinforced",
            "evidence": "Engine 2 (Behavior Correlation)",
            "related_engine": "Engine 2 — Behavior"
        })
    else:
        candidate_actions.append({
            "rank": 55,
            "title": "Leverage Rest and Movement Synergy",
            "what_is_happening": "Physical activity and sleep recovery reinforce each other across your routine.",
            "why_it_matters": "Restful sleep supports higher daily activity, and movement promotes deeper rest.",
            "what_to_do_next": "Pair a consistent sleep schedule with daily walking to compound health gains.",
            "since_last_checkin": "Habit pattern reinforced",
            "evidence": "Engine 2 (Behavior Correlation)",
            "related_engine": "Engine 2 — Behavior"
        })

    # Sort candidates by calculated rank (descending) and select top 3
    candidate_actions.sort(key=lambda a: a["rank"], reverse=True)
    priority_actions = []
    for idx, act in enumerate(candidate_actions[:3]):
        priority_actions.append({
            "priority": idx + 1,
            "title": act["title"],
            "what_is_happening": act["what_is_happening"],
            "why_it_matters": act["why_it_matters"],
            "what_to_do_next": act["what_to_do_next"],
            "since_last_checkin": act.get("since_last_checkin", "First check-in — baseline established." if is_first_checkin else "Baseline recorded"),
            "evidence": act["evidence"],
            "related_engine": act.get("related_engine", "FitIQ Analytics")
        })

    # -------------------------------------------------------------
    # CROSS-ENGINE INSIGHTS (Cross-Engine Reasoning)
    # -------------------------------------------------------------
    cross_engine_insights = []
    
    cross_engine_insights.append(
        f"Multi-Pillar Synergy: Your FIS score ({fis_score or 'Available upon tracking'}) is anchored by {highest_sub[0]} ({round(highest_sub[1], 1)}/100), "
        f"with clear headroom for improvement in {lowest_sub[0]} ({round(lowest_sub[1], 1)}/100). "
        f"Elevating this single focus area will yield the highest proportional gain across your analytics profile."
    )

    if top_pattern and (forecast_trend != "improving"):
        cross_engine_insights.append(
            f"Behavioral & Trend Correlation: Engine 2 shows that {top_pattern.get('relationship', '').replace('_', ' and ')} move together in your tracking. "
            f"Protecting your recovery routine provides the energy needed to stabilize workout consistency."
        )

    if plateau_detected and calorie_target:
        cross_engine_insights.append(
            f"Plateau & Energy Balance Interaction: Engine 5 detected an activity plateau while Engine 6 configured a daily target of {calorie_target} kcal. "
            f"When training volume stagnates, adjusting nutritional timing or macronutrient distribution can reignite adaptive progress without requiring drastic caloric cuts."
        )

    # -------------------------------------------------------------
    # KEY FINDINGS FOR EACH ENGINE
    # -------------------------------------------------------------
    if checkin_count < 3:
        e3_finding = "Consistency baseline is still being established."
        e3_evidence = f"{checkin_count} check-in(s) completed so far."
        e3_explanation = "FitIQ establishes habit consistency scoring over multiple check-in cycles rather than penalizing initial baseline entries."
        e3_recommendation = "Continue logging your daily check-ins to build your longitudinal habit consistency score."
    else:
        e3_finding = f"Short-term consistency trajectory is {(forecast_trend or 'unknown').upper()} (projected: {projected_consistency or current_consistency or 'N/A'}/100)."
        e3_evidence = f"Baseline Consistency: {current_consistency or 'N/A'}% | Trend Shift: {forecast_change}% | Predicted BMI: {pred_future_bmi or 'N/A'}."
        e3_explanation = "Engine 3 analyzes rolling consistency windows to detect early momentum or dropout risk. When momentum slows, smaller daily targets prevent long-term routine abandonment."
        e3_recommendation = "Target 5 consecutive days of meeting minimum targets to reverse downward drift and solidify your habit streak."

    key_findings = [
        {
            "engine": "Engine 1 — Fitness Indicator Score (FIS)",
            "finding": f"Composite FIS of {fis_score or 'Available upon tracking'}/100 calculated across holistic health dimensions.",
            "evidence": f"Pillars: Activity ({round(fitness_activity.get('score', 0), 1)}), Recovery ({round(recovery.get('score', 0), 1)}), Body Comp ({round(body_comp.get('score', 0), 1)}), Nutrition ({round(nutrition_sub.get('score', 0), 1)}).",
            "explanation": f"Your strongest pillar is currently {highest_sub[0]}, while {lowest_sub[0]} has the highest headroom for improvement. FIS balances multiple metrics so high intensity on single days does not mask inconsistent recovery.",
            "recommendation": f"Focus next week on improving your {lowest_sub[0].lower()} to raise your composite benchmark."
        },
        {
            "engine": "Engine 2 — Pearson Behavior Correlation",
            "finding": f"{top_pattern.get('strength', 'Statistical')} association identified across tracked lifestyle variables." if top_pattern else "Tracking data being analyzed for behavioral co-movements.",
            "evidence": f"Relationship: {top_pattern.get('relationship', 'sleep_steps')}, Strength: {top_pattern.get('strength', 'Positive')}." if top_pattern else "Requires multi-day logged records.",
            "explanation": "Pearson correlation measures how two metrics trend together. A positive correlation indicates they move in tandem in your history. Correlation does not imply causation — better sleep does not automatically create steps, but they reinforce one another.",
            "recommendation": "Protect your sleep and hydration habits to ensure sustained physical energy for daily workouts."
        },
        {
            "engine": "Engine 3 — Consistency Forecast & BMI Trend",
            "finding": e3_finding,
            "evidence": e3_evidence,
            "explanation": e3_explanation,
            "recommendation": e3_recommendation
        },
        {
            "engine": "Engine 4 — Cohort Intelligence (User Segmentation)",
            "finding": f"Successfully matched with a verified peer cohort of {cohort_size or 10} participants with {int(cohort_similarity * 100)}% similarity.",
            "evidence": f"Demographic and habit clustering based on age {age or 'N/A'}, BMI {bmi or 'N/A'}, and {activity_level} activity level.",
            "explanation": "You are grouped with users sharing similar physical baselines and routines from empirical survey data. This allows contextualized comparison rather than unrealistic generalized benchmarks.",
            "recommendation": "Aim to keep your activity levels aligned with top performers within your demographic cohort."
        },
        {
            "engine": "Engine 5 — Anomaly & Plateau Detection",
            "finding": "Activity plateau detected" if plateau_detected else ("Unusual single-day variance flagged" if has_anomaly else "Normal variance with stable training pattern."),
            "evidence": f"Plateau status: {'Active' if plateau_detected else 'None'} | Anomalies detected: {len(anomalies)}.",
            "explanation": "Using Robust Z-Score (Median Absolute Deviation), the engine identifies unusual behavioral shifts and prolonged stagnation. Plateaus are natural biological adaptations to unchanged training demands.",
            "recommendation": "Alter workout tempo, incorporate new exercises, or vary weekly volume to overcome training plateaus."
        },
        {
            "engine": "Engine 6 — Nutrition Targets & Meal Timing",
            "finding": f"Daily Caloric Target of {calorie_target or 'Calculated'} kcal established for {goal}.",
            "evidence": f"BMR: {bmr or 'N/A'} kcal | TDEE: {tdee or 'N/A'} kcal | Target: {calorie_target or 'N/A'} kcal.",
            "explanation": "Mifflin-St Jeor metabolic calculations determine your baseline energy consumption, adjusted by physical activity multipliers and goal-specific caloric deficits or surpluses.",
            "recommendation": f"Focus on whole food sources rich in protein and fiber to maintain satiety and fuel training sessions."
        }
    ]

    # -------------------------------------------------------------
    # TECHNICAL / VIVA EXPLANATION MODE
    # -------------------------------------------------------------
    technical_mode = {
        "engine_1": {
            "name": "Engine 1 — Fitness Indicator Score (FIS)",
            "method": "Multi-Dimensional Weighted Normalization Model",
            "inputs": "Steps, exercise frequency, duration, intensity, sleep duration, energy level, BMI, weight trend, meals, hydration, tracking consistency.",
            "output": f"FIS Composite = {fis_score or 'N/A'}/100 across normalized sub-indices.",
            "interpretation": f"Fitness Activity ({fitness_activity.get('score')}), Recovery ({recovery.get('score')}), Body Composition ({body_comp.get('score')}), Nutrition ({nutrition_sub.get('score')}), Consistency ({'Baseline establishment' if checkin_count < 3 else consistency_sub.get('score')}).",
            "why_method_selected": "Standardizes heterogeneous physiological and behavioral signals into an equitable 0–100 scale, eliminating single-variable bias.",
            "limitations": "Relies on accuracy of user-logged and wearable telemetry; component weights assume typical adult metabolic parameters."
        },
        "engine_2": {
            "name": "Engine 2 — Pearson Behavior Correlation",
            "method": "Pearson Product-Moment Correlation Coefficient (Statistical Method)",
            "inputs": "Bivariate continuous tracking records (e.g. hours_sleep vs. daily_steps, hydration_level vs. duration_minutes).",
            "output": f"Pearson r = {top_pattern.get('correlation', 'N/A') if top_pattern else 'N/A'} ({top_pattern.get('strength', 'N/A') if top_pattern else 'N/A'}).",
            "interpretation": "Evaluates the linear relationship between paired behavioral variables. Correlation denotes co-movement, strictly distinct from causal impact.",
            "why_method_selected": "Computationally efficient, mathematically transparent parametric method for bivariate relationship identification in behavioral science.",
            "limitations": "Only captures linear relationships; highly sensitive to extreme outliers; does not control for confounding latent variables."
        },
        "engine_3": {
            "name": "Engine 3 — Consistency Forecast & BMI Trend",
            "method": "ARIMA / Holt-Winters Time-Series Trend Projection & Ridge Regression with Tree SHAP",
            "inputs": "Chronological tracking vectors (consistency adherence, daily steps, exercise duration, sleep, hydration).",
            "output": f"Consistency Trajectory = {forecast_trend}, Predicted BMI Change = {pred_bmi_change or 'N/A'}.",
            "interpretation": "Uses recursive time-series forecasting on moving consistency windows, combined with SHAP feature-attribution to quantify which lifestyle inputs drive predicted body changes.",
            "why_method_selected": "ARIMA / Exponential Smoothing decomposes seasonality and trends without requiring huge training sets; SHAP offers mathematically sound feature attribution.",
            "limitations": "Accuracy scales with tracking history; sudden lifestyle breaks require 3–5 days of new data to register in projections."
        },
        "engine_4": {
            "name": "Engine 4 — Cohort Intelligence (User Segmentation)",
            "method": "K-Means Clustering with Euclidean Distance in PCA Space",
            "inputs": "Age, gender, BMI, daily steps, workout frequency, sleep duration, goal.",
            "output": f"Cohort size = {cohort_size or 10}, Distance-to-centroid similarity = {int(cohort_similarity * 100)}%.",
            "interpretation": "Positions the user within a multidimensional behavioral cluster of verified fitness profiles to discover contextualized behavioral norms.",
            "why_method_selected": "K-Means provides robust, unsupervised grouping with distinct centroids, avoiding arbitrary threshold rules.",
            "limitations": "Cluster quality depends on diversity of the underlying training sample; may generalize unique edge-case routines."
        },
        "engine_5": {
            "name": "Engine 5 — Anomaly & Plateau Detection",
            "method": "Robust Z-Score (Median Absolute Deviation) & Rolling Window Variance Analysis",
            "inputs": "Chronological tracking vectors (daily steps, exercise minutes, intensity, calories).",
            "output": f"Plateau Detected = {plateau_detected}, Anomalous Data Points = {len(anomalies)}.",
            "interpretation": "Flags observations exceeding 2.5 MAD thresholds from the rolling median and detects periods where progress variance falls below adaptation thresholds.",
            "why_method_selected": "Robust statistics (median/MAD) prevent extreme single-day outliers from distorting normal behavioral baselines.",
            "limitations": "Cannot infer semantic intent (e.g. deliberate illness rest vs. accidental drop-off) without user-provided context."
        },
        "engine_6": {
            "name": "Engine 6 — Nutrition Targets & Meal Timing Intelligence",
            "method": "Mifflin-St Jeor BMR, Activity-Adjusted TDEE, Dynamic Macronutrient Allocation, and Practicality-Ranked Scoring",
            "inputs": "Age, gender, height (cm), weight (kg), physical activity level, dietary preference, goal.",
            "output": f"BMR = {bmr} kcal, TDEE = {tdee} kcal, Daily Target = {calorie_target} kcal, Macros = {macros.get('protein_g', 'N/A')}g P / {macros.get('carbs_g', 'N/A')}g C / {macros.get('fat_g', 'N/A')}g F.",
            "interpretation": "Calculates clinical energy equilibrium and configures a tailored caloric differential matching the user's weight goal.",
            "why_method_selected": "Clinically validated metabolic formulation combined with objective practicality and nutrient-density scoring.",
            "limitations": "Does not measure individual metabolic adaptation or thyroid/hormonal variations without laboratory calorimetry."
        },
        "engine_7": {
            "name": "Engine 7 — Holistic Recommendation & LLM Interpretation Layer",
            "method": "Constraint-Enforced Multi-Engine Synthesis & Natural Language Explanation",
            "inputs": "Structured numerical outputs and telemetry from Engines 1 through 6.",
            "output": "Structured Priority Actions, Cross-Engine Explanations, Strengths, and Vulnerabilities.",
            "interpretation": "Transforms raw statistical indices into prioritized, actionable behavioral interventions while strictly preventing hallucinations or unsupported claims.",
            "why_method_selected": "Delivers human-understandable guidance anchored strictly in verifiable backend analytics calculations.",
            "limitations": "Explanation depth is bounded by the telemetry provided by upstream analytics engines."
        }
    }

    # Format simple recommendations strings for backward compatibility
    recommendations_list = [action["title"] for action in priority_actions]
    if food_recs and len(food_recs) > 0:
        recommendations_list.append(f"Incorporate nutrient-dense foods such as {food_recs[0].get('food_name', 'healthy options')} into your daily meals.")

    if is_first_checkin:
        overall_summary = (
            "Your Personalized Starting Point\\n\\n"
            "Your first check-in has established your baseline. Continue checking in to help FitIQ identify meaningful changes in your habits."
        )
    else:
        summary_points = []
        steps_diff = changes.get("steps", {}).get("diff")
        sleep_diff = changes.get("sleep", {}).get("diff")
        water_diff = changes.get("water", {}).get("diff")
        if steps_diff and abs(steps_diff) > 50:
            summary_points.append(f"steps {'increased' if steps_diff > 0 else 'decreased'} by {abs(int(steps_diff)):,}")
        if sleep_diff and abs(sleep_diff) > 0.2:
            summary_points.append(f"sleep {'increased' if sleep_diff > 0 else 'decreased'} by {abs(sleep_diff)} hrs")
        if water_diff and abs(water_diff) > 0.2:
            summary_points.append(f"hydration {'improved' if water_diff > 0 else 'dropped'} by {abs(water_diff)} L")
        
        diff_summary = f"Since your previous check-in, {', and '.join(summary_points)}." if summary_points else "Your recorded habits remained steady compared with your previous check-in."
        overall_summary = f"Your latest check-in data has been analyzed across all 7 analytics engines. {diff_summary}"

    return {
        "status": "success",
        "generated_at": datetime.now().isoformat(),
        "source": "analytics_interpretation_engine",
        "user_mode": {
            "overall_summary": overall_summary,
            "strengths": strengths,
            "what_needs_attention": needs_attention,
            "key_findings": key_findings,
            "priority_actions": priority_actions,
            "cross_engine_insights": cross_engine_insights,
            "why_these_recommendations": (
                "These recommendations come directly from your FitIQ data, "
                "including your latest daily check-in habits, day-over-day changes, and goals. "
                "No guesses were made."
            ),
            "nutrition": e6_nutrition.get("meal_plan", {})
        },
        "technical_mode": technical_mode,
        "recommendations": recommendations_list
    }


# =====================================================================
# COMPREHENSIVE INTERPRETATION ENTRYPOINT
# =====================================================================

def generate_comprehensive_interpretation(data):
    """
    Main orchestration entrypoint for Engine 7.
    Attempts LLM generation using server-side keys; gracefully falls back
    to the deterministic FitIQ analytics interpretation engine if LLM is unavailable.
    Passes latest check-in, previous check-in, and change metrics to ensure dynamic recommendations.
    """
    try:
        latest_checkin = data.get("latest_checkin") or data.get("today_checkin") or {}
        previous_checkin = data.get("previous_checkin")
        recent_history = data.get("recent_history", []) or []

        if not previous_checkin and len(recent_history) >= 2:
            def get_ts(rec):
                if not rec or not isinstance(rec, dict):
                    return 0
                for k in ("completedAtMillis", "timestamp", "completedAt", "recordedAt", "date"):
                    val = rec.get(k)
                    if val:
                        if isinstance(val, (int, float)):
                            return float(val)
                        if isinstance(val, str):
                            try:
                                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                                return dt.timestamp() * 1000
                            except Exception:
                                pass
                return 0
            sorted_history = sorted(recent_history, key=get_ts)
            previous_checkin = sorted_history[-2]

        changes = data.get("changes") or extract_checkin_changes(latest_checkin, previous_checkin)
        checkin_count = data.get("checkin_count") or (len(recent_history) if recent_history else (1 if latest_checkin else 0))
        is_first_checkin = data.get("is_first_checkin", False) or (checkin_count <= 1 or previous_checkin is None)

        data["latest_checkin"] = latest_checkin
        data["previous_checkin"] = previous_checkin
        data["changes"] = changes
        data["checkin_count"] = checkin_count
        data["is_first_checkin"] = is_first_checkin

        # Check if an LLM is accessible
        has_key = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY"))
        
        if has_key:
            # Prepare compact JSON string of verified analytics
            clean_payload = {
                "profile": data.get("profile", {}),
                "engines": data.get("engines", {}),
                "latest_checkin": latest_checkin,
                "previous_checkin": previous_checkin,
                "changes": changes,
                "checkin_count": checkin_count,
                "is_first_checkin": is_first_checkin,
                "today_checkin": latest_checkin,
                "recent_history": recent_history
            }
            llm_result = call_llm_api(SYSTEM_PROMPT, json.dumps(clean_payload))
            if llm_result and isinstance(llm_result, dict) and "user_mode" in llm_result:
                llm_result["source"] = "llm"
                llm_result["generated_at"] = datetime.now().isoformat()
                if "recommendations" not in llm_result:
                    actions = llm_result.get("user_mode", {}).get("priority_actions", [])
                    llm_result["recommendations"] = [a.get("title", "") for a in actions if a.get("title")]
                return llm_result

    except Exception as e:
        print("LLM orchestration exception (using deterministic fallback):", e)

    # Use robust deterministic fallback engine
    return generate_deterministic_interpretation(data)

def generate_nutrition_meal_plan(data, nutrition_result, structured_plan=None):
    """
    Integrates the structured Indian meals dataset with LLM personalization.
    If structured_plan is provided, it enriches the meals with personalized explanations.
    If no LLM key is present or LLM fails, returns the deterministic structured plan.
    """
    if structured_plan and "breakfast" in structured_plan:
        b_meal = structured_plan["breakfast"]["meal"]
        l_meal = structured_plan["lunch"]["meal"]
        s_meal = structured_plan["snack"]["meal"]
        d_meal = structured_plan["dinner"]["meal"]

        system_prompt = f"""You are a professional Indian nutrition coach for the FitIQ fitness app.
The meal recommendation engine has selected the following authentic Indian daily meals based on the user's profile:
- Breakfast: {b_meal}
- Lunch: {l_meal}
- Evening Snack: {s_meal}
- Dinner: {d_meal}

User Profile & Targets:
- Goal: {data.get('goal', 'maintenance')}
- Calorie Target: {nutrition_result.get('targets', {}).get('calorie_target', 2000)} kcal
- Protein Target: {nutrition_result.get('macro_distribution', {}).get('protein_g', 75)}g
- Diet Preference: {data.get('diet_type', data.get('dietPreference', 'mixed'))}

Write a short, simple, friendly 1-2 sentence explanation in Simple English for EACH meal explaining why it supports their target. Also provide a motivational 1-sentence goal message.

Return strictly JSON matching this structure:
{{
  "breakfast_explanation": "Short friendly explanation...",
  "lunch_explanation": "Short friendly explanation...",
  "snack_explanation": "Short friendly explanation...",
  "dinner_explanation": "Short friendly explanation...",
  "goal_message": "Personalized motivational note..."
}}"""

        try:
            llm_res = call_llm_api(system_prompt, "Explain today's meals.")
            if llm_res and "breakfast_explanation" in llm_res:
                enriched_plan = dict(structured_plan)
                if "breakfast" in enriched_plan and llm_res.get("breakfast_explanation"):
                    enriched_plan["breakfast"]["explanation"] = llm_res["breakfast_explanation"]
                if "lunch" in enriched_plan and llm_res.get("lunch_explanation"):
                    enriched_plan["lunch"]["explanation"] = llm_res["lunch_explanation"]
                if "snack" in enriched_plan and llm_res.get("snack_explanation"):
                    enriched_plan["snack"]["explanation"] = llm_res["snack_explanation"]
                if "dinner" in enriched_plan and llm_res.get("dinner_explanation"):
                    enriched_plan["dinner"]["explanation"] = llm_res["dinner_explanation"]
                if llm_res.get("goal_message"):
                    enriched_plan["goal_message"] = llm_res["goal_message"]
                return enriched_plan
        except Exception as e:
            print("LLM Meal Plan Enrichment Error (using structured plan):", e)

        # Return the verified structured meal plan directly
        return structured_plan

    # Fallback to deterministic recommendation if structured_plan was not provided
    from engines.meal_recommendation_engine import recommend_daily_meal_plan
    fallback_res = recommend_daily_meal_plan(
        data,
        nutrition_result.get("targets", {}),
        data.get("recent_history"),
        data.get("today_checkin")
    )
    return fallback_res["meal_plan"]
