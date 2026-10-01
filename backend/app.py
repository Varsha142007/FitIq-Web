import profile
import os
import joblib
import pandas as pd
import shap
from flask import Flask, request, jsonify
from flask_cors import CORS
from analytics.recommendation import generate_recommendations
from analytics.bodyAnalysis import (
    calculate_bmi,
    bmi_category,
    calculate_bmr,
    calculate_tdee,
    ideal_weight_range,
    calculate_health_score
)
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "ml"))
from engines.fis_engine import (
    calculate_step_score,
    calculate_exercise_frequency_score,
    calculate_exercise_duration_score,
    calculate_intensity_score,
    calculate_sleep_score,
    calculate_energy_score,
    calculate_fitness_activity_score,
    calculate_recovery_score,
    calculate_body_composition_score,
    calculate_nutrition_score,
    calculate_consistency_score,
    calculate_fis_score,
    calculate_bmi_score,
    calculate_weight_trend_score,
    calculate_meal_frequency_score,
    calculate_hydration_score,
    calculate_consistency_from_history,
)
from engines.behavior_engine import (
    load_foundation_data,
    analyze_behavior
)
from engines.consistency_prediction_engine import calculate_consistency_forecast
from engines.cohort_engine import analyze_cohort
from engines.e5_anomaly_engine import (
    analyze_e5,
    analyze_user_activity
)
from engines.nutrition_engine import analyze_nutrition
from engines.meal_recommendation_engine import recommend_daily_meal_plan
from llm_service import generate_behavior_insights, generate_comprehensive_interpretation, generate_nutrition_meal_plan
app = Flask(__name__)
cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "FITIQ_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
CORS(app, origins=cors_origins)


@app.route("/")
def home():
    return "FitIQ Backend Running 🚀"


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "fitiq-backend"}), 200


@app.route("/body-analysis", methods=["POST"])
def body_analysis():

    data = request.get_json()

    age = data["age"]
    gender = data["gender"]
    height = data["height"]
    weight = data["weight"]
    activity = data["activityLevel"]

    # ================= BODY ANALYSIS =================

    bmi = calculate_bmi(weight, height)

    category = bmi_category(bmi)

    bmr = calculate_bmr(
        weight,
        height,
        age,
        gender
    )

    tdee = calculate_tdee(
        bmr,
        activity
    )

    ideal_min, ideal_max = ideal_weight_range(height)

    # ================= RESPONSE =================

    return jsonify({
        "bmi": bmi,
        "category": category,
        "bmr": bmr,
        "tdee": tdee,
        "idealWeight": {
            "min": ideal_min,
            "max": ideal_max
        }
    })

@app.route("/fis", methods=["POST"])
def fis():
    data = request.get_json()

    profile = data.get("profile", {})
    tracking_records = data.get("trackingRecords", [])

    step_score = calculate_step_score(
        profile.get("averageSteps")
    )

    frequency_score = calculate_exercise_frequency_score(
        profile.get("exerciseDays")
    )

    duration_score = calculate_exercise_duration_score(
        profile.get("averageExerciseDuration")
    )

    intensities = [
        record.get("exerciseIntensity")
        for record in tracking_records
        if record.get("exerciseIntensity")
    ]

    intensity_score = None

    if intensities:
        intensity_scores = [
            calculate_intensity_score(intensity)
            for intensity in intensities
        ]

        intensity_scores = [
            score for score in intensity_scores
            if score is not None
        ]

        if intensity_scores:
            intensity_score = sum(intensity_scores) / len(intensity_scores)

    fitness_activity_score = calculate_fitness_activity_score(
        step_score,
        frequency_score,
        duration_score,
        intensity_score
    )
    sleep_score = calculate_sleep_score(
    profile.get("averageSleepHours")
)

    energy_values = [
    record.get("energyLevel")
    for record in tracking_records
    if record.get("energyLevel")
]

    energy_scores = [
    calculate_energy_score(energy)
    for energy in energy_values
]

    energy_scores = [
    score for score in energy_scores
    if score is not None
]

    energy_score = None

    if energy_scores:
        energy_score = sum(energy_scores) / len(energy_scores)

    recovery_score = calculate_recovery_score(
    sleep_score,
    energy_score
)
    bmi_score = calculate_bmi_score(
    profile.get("bmi")
)

    weight_trend_score = calculate_weight_trend_score(
    profile.get("previousWeight"),
    profile.get("weight"),
    profile.get("goal")
)

    body_composition_score = calculate_body_composition_score(
    bmi_score,
    weight_trend_score
)
    meal_frequency_score = calculate_meal_frequency_score(
    profile.get("mealsPerDay")
)

    hydration_score = calculate_hydration_score(
    profile.get("averageWaterIntake")
)

    nutrition_score = calculate_nutrition_score(
    meal_frequency_score,
    hydration_score
)
    consistency_score = calculate_consistency_from_history(
    profile.get("dailyConsistency")
)
    fis_score = calculate_fis_score(
    fitness_activity_score,
    recovery_score,
    body_composition_score,
    nutrition_score,
    consistency_score
)

    return jsonify({
    "fitnessActivity": {
        "stepScore": step_score,
        "frequencyScore": frequency_score,
        "durationScore": duration_score,
        "intensityScore": round(intensity_score, 2)
            if intensity_score is not None else None,
        "score": fitness_activity_score
    },

    "recovery": {
        "sleepScore": sleep_score,
        "energyScore": round(energy_score, 2)
            if energy_score is not None else None,
        "score": recovery_score
    },
    "bodyComposition": {
    "bmiScore": bmi_score,
    "weightTrendScore": weight_trend_score,
    "score": body_composition_score
    },
    "nutrition": {
    "mealFrequencyScore": meal_frequency_score,
    "hydrationScore": hydration_score,
    "score": nutrition_score
},
    "consistency": {
    "score": consistency_score
},
    
    "fis": fis_score
})

@app.route("/behavior", methods=["POST"])
def behavior_analysis():

    data = request.get_json()

    tracking_records = data.get("trackingRecords", [])

    foundation_df = (
        None
        if tracking_records is not None and len(tracking_records) >= 7
        else load_foundation_data()
    )

    result = analyze_behavior(
        tracking_records,
        foundation_df
    )

    insights = generate_behavior_insights(
        result["mode"],
        result["patterns"]
    )

    result["llmInsights"] = insights

    return jsonify(result)

# Load E3 prediction model
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "ml",
    "models",
    "fitiq_bmi_change_model.pkl"
)

prediction_model = joblib.load(MODEL_PATH)

@app.route("/prediction", methods=["POST"])
def prediction_analysis():
    try:
        data = request.get_json()

        age = data.get("age")
        height_cm = data.get("height_cm")
        weight_kg = data.get("weight_kg")
        fitiq_bmi = data.get("fitiq_bmi")
        daily_steps = data.get("daily_steps")
        duration_minutes = data.get("duration_minutes")
        hours_sleep = data.get("hours_sleep")
        hydration_level = data.get("hydration_level")
        stress_level = data.get("stress_level")

        input_data = pd.DataFrame([{
            "age": age,
            "height_cm": height_cm,
            "weight_kg": weight_kg,
            "fitiq_bmi": fitiq_bmi,
            "daily_steps": daily_steps,
            "duration_minutes": duration_minutes,
            "hours_sleep": hours_sleep,
            "hydration_level": hydration_level,
            "stress_level": stress_level
        }])

        predicted_change = float(
            prediction_model.predict(input_data)[0]
        )

        predicted_future_bmi = (
            float(fitiq_bmi) + predicted_change
        )

        # ================= SHAP EXPLANATION =================

        explainer = shap.TreeExplainer(prediction_model)

        shap_values = explainer.shap_values(input_data)

        shap_importance = pd.DataFrame({
            "feature": input_data.columns,
            "impact": shap_values[0]
        })

        shap_importance["abs_impact"] = (
            shap_importance["impact"].abs()
        )

        shap_importance = (
            shap_importance
            .sort_values("abs_impact", ascending=False)
            .head(5)
        )

        shap_factors = []

        for _, row in shap_importance.iterrows():

            shap_factors.append({
                "feature": row["feature"],
                "impact": float(row["impact"])
            })

        # ================= RESPONSE =================

        return jsonify({
            "current_bmi": float(fitiq_bmi),
            "predicted_bmi_change": predicted_change,
            "predicted_future_bmi": predicted_future_bmi,
            "shap_factors": shap_factors
        })

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500

@app.route("/consistency-prediction", methods=["POST"])
def consistency_prediction():
    try:
        data = request.get_json()

        tracking_records = data.get("trackingRecords", [])

        result = calculate_consistency_forecast(
            tracking_records
        )

        return jsonify(result)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route("/cohort", methods=["POST"])
def cohort_analysis():
    try:
        data = request.get_json()

        result = analyze_cohort(data)

        return jsonify(result)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route("/anomaly", methods=["POST"])
def anomaly_analysis():

    try:

        data = request.get_json(silent=True) or {}

        tracking_records = data.get(
            "trackingRecords",
            []
        )

        result = analyze_user_activity(
            tracking_records
        )

        return jsonify(result), 200

    except Exception as e:

        print(
            "E5 activity pattern analysis error:",
            str(e)
        )

        return jsonify({
            "status": "error",
            "message":
                "Unable to analyze your activity pattern."
        }), 500

@app.route("/nutrition", methods=["POST"])
def nutrition_analysis():
    try:
        data = request.get_json(silent=True) or {}

        # 1. Existing USDA nutrition engine calculations (BMR, TDEE, Calorie target, Macros, USDA scored foods)
        result = analyze_nutrition(data)

        if result.get("status") == "success":
            # 2. Curated Indian meal plan using meal recommendation engine
            plan_result = recommend_daily_meal_plan(
                data,
                result.get("targets", {}),
                data.get("recent_history"),
                data.get("today_checkin")
            )

            # 3. Enrich meal plan descriptions with LLM / smart coaching notes
            meal_plan = generate_nutrition_meal_plan(data, result, plan_result.get("meal_plan"))

            result["meal_plan"] = meal_plan
            result["planned_totals"] = plan_result.get("planned_totals", {})
            result["summary"] = plan_result.get("summary", {})
            result["hydration"] = plan_result.get("hydration", {})

        return jsonify(result), 200

    except Exception as e:
        print("E6 nutrition analysis error:", str(e))

        return jsonify({
            "status": "error",
            "message": "Unable to generate nutrition recommendations.",
            "error": str(e)
        }), 500

@app.route("/recommendations", methods=["POST"])
def recommendations():

    data = request.json

    result = generate_recommendations(data)

    return jsonify({
        "recommendations": result
    })


@app.route("/comprehensive-interpretation", methods=["POST"])
def comprehensive_interpretation():
    """
    Engine 7 — Holistic LLM Interpretation Layer.
    Accepts all engine outputs + user profile from the frontend,
    runs them through the LLM (or deterministic fallback), and
    returns structured insights, priority actions, and cross-engine analysis.
    """
    try:
        data = request.get_json(silent=True) or {}

        result = generate_comprehensive_interpretation(data)

        return jsonify(result), 200

    except Exception as e:
        print("Comprehensive interpretation error:", str(e))
        return jsonify({
            "status": "error",
            "message": "Personalized explanation is temporarily unavailable. Your analytics results are still displayed.",
            "error": str(e)
        }), 500

if __name__ == "__main__":
    app.run(
        host=os.environ.get("FITIQ_BACKEND_HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", os.environ.get("FITIQ_BACKEND_PORT", "5000"))),
        debug=False,
    )