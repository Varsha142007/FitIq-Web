import os
import math
from pathlib import Path
import pandas as pd

# =========================================================================
# DATA PATHS
# =========================================================================
DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "nutrition" / "processed"
MEALS_CSV_PATH = DATA_DIR / "meals.csv"
USDA_CSV_PATH = DATA_DIR / "FitIQ_Nutrition_Cleaned.csv"

_CACHED_MEALS_DF = None
_CACHED_USDA_DF = None

def load_meals_dataset():
    """Load and cache the curated Indian meals dataset."""
    global _CACHED_MEALS_DF
    if _CACHED_MEALS_DF is not None:
        return _CACHED_MEALS_DF.copy()

    if not MEALS_CSV_PATH.exists():
        raise FileNotFoundError(f"Meals dataset not found at: {MEALS_CSV_PATH}")

    df = pd.read_csv(MEALS_CSV_PATH, encoding="utf-8")
    _CACHED_MEALS_DF = df
    return df.copy()

def load_usda_reference():
    """Load and cache the USDA cleaned foundation dataset for ingredient verification."""
    global _CACHED_USDA_DF
    if _CACHED_USDA_DF is not None:
        return _CACHED_USDA_DF.copy()

    if USDA_CSV_PATH.exists():
        try:
            df = pd.read_csv(USDA_CSV_PATH, encoding="utf-8", low_memory=False)
            _CACHED_USDA_DF = df
            return df.copy()
        except Exception:
            return None
    return None

# =========================================================================
# DIET PREFERENCE FILTER
# =========================================================================
def filter_meals_by_diet(df, diet_preference):
    """
    Strictly filter candidate meals according to user's stored diet preference.
    """
    diet = str(diet_preference or "mixed").lower().strip()

    if diet in ["vegan"]:
        # Strictly plant-based: no dairy, no eggs, no chicken, no fish, no meat
        return df[
            (df["diet_type"] == "vegan") &
            (df["contains_dairy"] == 0) &
            (df["contains_egg"] == 0) &
            (df["contains_chicken"] == 0) &
            (df["contains_fish"] == 0) &
            (df["contains_meat"] == 0)
        ].copy()

    if diet in ["vegetarian", "veg"]:
        # Strictly vegetarian: allows vegan and vegetarian, no chicken, fish, meat
        # Eggs only if diet specifies 'eggetarian'
        is_eggetarian = "egg" in diet
        if is_eggetarian:
            return df[
                (df["contains_chicken"] == 0) &
                (df["contains_fish"] == 0) &
                (df["contains_meat"] == 0)
            ].copy()
        else:
            return df[
                (df["diet_type"].isin(["vegetarian", "vegan"])) &
                (df["contains_chicken"] == 0) &
                (df["contains_fish"] == 0) &
                (df["contains_meat"] == 0) &
                (df["contains_egg"] == 0)
            ].copy()

    # Non-vegetarian and mixed can enjoy all supported meals (veg + egg + non-veg)
    return df.copy()

# =========================================================================
# SLOT TARGET CALCULATOR
# =========================================================================
def get_slot_targets(daily_calories, daily_macros, goal):
    """
    Distribute daily calorie and macronutrient targets across 4 daily meals.
    Breakfast ~25%, Lunch ~35%, Snack ~12%, Dinner ~28%.
    """
    slot_ratios = {
        "breakfast": {"cal": 0.25, "name": "Breakfast"},
        "lunch":     {"cal": 0.35, "name": "Lunch"},
        "snack":     {"cal": 0.12, "name": "Evening Snack"},
        "dinner":    {"cal": 0.28, "name": "Dinner"}
    }

    slot_targets = {}
    for slot, conf in slot_ratios.items():
        ratio = conf["cal"]
        slot_targets[slot] = {
            "calories": round(daily_calories * ratio),
            "protein_g": round(daily_macros.get("protein_g", 70) * ratio, 1),
            "carbs_g": round(daily_macros.get("carbs_g", 250) * ratio, 1),
            "fat_g": round(daily_macros.get("fat_g", 60) * ratio, 1)
        }

    return slot_targets

# =========================================================================
# MEAL SCORING ALGORITHM
# =========================================================================
def score_meal_candidate(meal_row, slot_target, goal, activity_level, chosen_ingredients, recent_meal_names, diet_pref="mixed"):
    """
    Transparently score candidate meals based on 10 criteria:
    1. Calorie proximity to slot target
    2. Protein contribution and proximity to target
    3. Goal tag alignment (weight loss, muscle gain, etc.)
    4. Fiber content & nutrient density
    5. Non-vegetarian affinity for non-veg users
    6. Activity level alignment
    7. Cross-meal ingredient variety (avoids repeated main proteins)
    8. Repetition penalty (from recent check-ins)
    """
    score = 100.0

    # 1. Calorie Proximity (continuous Gaussian-like penalty)
    target_cals = slot_target["calories"]
    actual_cals = float(meal_row["calories"])
    cal_diff_pct = abs(actual_cals - target_cals) / max(target_cals, 1)

    if cal_diff_pct <= 0.10:
        score += 25
    elif cal_diff_pct <= 0.20:
        score += 15
    elif cal_diff_pct <= 0.35:
        score += 0
    else:
        score -= min(40, round(cal_diff_pct * 60))

    # 2. Protein Contribution & Proximity
    target_pro = slot_target["protein_g"]
    actual_pro = float(meal_row["protein_g"])
    
    # Continuous protein match score: reward getting close to target protein
    pro_diff_pct = abs(actual_pro - target_pro) / max(target_pro, 1)
    if pro_diff_pct <= 0.15:
        score += 20
    elif pro_diff_pct <= 0.30:
        score += 10

    norm_goal = str(goal or "").lower().strip()

    if "muscle" in norm_goal or "gain" in norm_goal:
        # High-protein reward
        if actual_pro >= 30:
            score += 35
        elif actual_pro >= 20:
            score += 20
        elif actual_pro < 15:
            score -= 25
    elif "loss" in norm_goal or "weight_loss" in norm_goal or "fat" in norm_goal:
        # High-protein + High-fiber reward for satiety
        if actual_pro >= 20:
            score += 20
        fiber = float(meal_row.get("fiber_g", 0))
        if fiber >= 7:
            score += 15
        # Penalize large calorie overshoots
        if actual_cals > target_cals + 60:
            score -= 25
    else:
        # Maintenance balance
        if 0.8 <= (actual_pro / max(target_pro, 1)) <= 1.25:
            score += 15

    # 3. Non-Vegetarian Affinity for Non-Veg Users
    is_non_veg_user = str(diet_pref).lower() in ["non_vegetarian", "non-vegetarian", "non-veg", "mixed"]
    is_non_veg_meal = bool(meal_row.get("contains_chicken") or meal_row.get("contains_fish") or meal_row.get("contains_egg") or meal_row.get("contains_meat"))
    
    if is_non_veg_user and is_non_veg_meal:
        score += 20  # Ensure non-veg users receive distinct non-veg meal options

    # 4. Goal Tag Match
    goal_tags = str(meal_row.get("goal_tags", "")).lower()
    if any(g in goal_tags for g in ["weight_loss", "loss"]) and "loss" in norm_goal:
        score += 15
    if any(g in goal_tags for g in ["muscle_gain", "gain"]) and ("muscle" in norm_goal or "gain" in norm_goal):
        score += 15
    if "maintenance" in goal_tags and ("maintenance" in norm_goal or norm_goal == ""):
        score += 10

    # 5. Activity Level
    act = str(activity_level or "").lower()
    if act in ["active", "very active"] and actual_cals >= target_cals:
        score += 10
    elif act in ["sedentary", "light"] and actual_cals <= target_cals:
        score += 10

    # 6. Cross-meal Ingredient Diversity
    # Prevent eating Paneer or Chicken for both Lunch and Dinner
    meal_name_lower = str(meal_row["meal_name"]).lower()
    main_items = ["paneer", "chicken", "fish", "egg", "soya", "tofu", "rajma", "chole", "poha", "upma"]
    for item in main_items:
        if item in meal_name_lower and item in chosen_ingredients:
            score -= 40  # Heavy penalty for repeated main protein/ingredient
            break

    # 7. Repetition Penalty against recent history
    for prev in recent_meal_names:
        if prev and prev.lower() in meal_name_lower:
            score -= 50
            break

    return max(0.0, round(score, 1))

# =========================================================================
# RECOMMEND COMPLETE DAILY MEAL PLAN
# =========================================================================
def recommend_daily_meal_plan(user_profile, nutrition_targets, recent_history=None, today_checkin=None):
    """
    Generates a personalized 4-meal daily nutrition plan using the curated
    Indian meal dataset, user profile, check-in data, and nutritional targets.
    """
    df = load_meals_dataset()
    diet_pref = user_profile.get("dietPreference") or user_profile.get("diet_type") or "mixed"
    filtered_df = filter_meals_by_diet(df, diet_pref)

    if filtered_df.empty:
        # Fallback to general vegetarian if filter was overly restrictive
        filtered_df = df[df["diet_type"] == "vegetarian"].copy()

    goal = user_profile.get("goal") or "maintenance"
    activity_level = user_profile.get("activityLevel") or user_profile.get("activity_level") or "moderate"
    daily_calories = float(nutrition_targets.get("calorie_target", 2000))
    daily_macros = nutrition_targets.get("macro_distribution", {
        "protein_g": round(daily_calories * 0.25 / 4, 1),
        "carbs_g": round(daily_calories * 0.45 / 4, 1),
        "fat_g": round(daily_calories * 0.30 / 9, 1)
    })

    # Collect recent meals from history to avoid repetition
    recent_meal_names = []
    if recent_history and isinstance(recent_history, list):
        for rec in recent_history[-5:]:
            if isinstance(rec, dict) and "meal_plan" in rec:
                mp = rec["meal_plan"]
                for s in ["breakfast", "lunch", "snack", "dinner"]:
                    if s in mp and isinstance(mp[s], dict):
                        recent_meal_names.append(mp[s].get("meal", ""))

    slot_targets = get_slot_targets(daily_calories, daily_macros, goal)
    chosen_plan = {}
    chosen_ingredients = set()

    meal_order = ["breakfast", "lunch", "snack", "dinner"]

    for slot in meal_order:
        candidates = filtered_df[filtered_df["meal_type"] == slot].copy()
        if candidates.empty:
            # Fallback to any meal of this slot from full dataset
            candidates = df[df["meal_type"] == slot].copy()

        slot_target = slot_targets[slot]

        candidates["match_score"] = candidates.apply(
            lambda row: score_meal_candidate(
                row,
                slot_target,
                goal,
                activity_level,
                chosen_ingredients,
                recent_meal_names,
                diet_pref
            ),
            axis=1
        )

        candidates = candidates.sort_values(by="match_score", ascending=False)
        best_meal = candidates.iloc[0].to_dict()

        # Track chosen main ingredients
        name_lower = str(best_meal["meal_name"]).lower()
        for item in ["paneer", "chicken", "fish", "egg", "soya", "tofu", "rajma", "chole", "poha", "upma"]:
            if item in name_lower:
                chosen_ingredients.add(item)

        meal_times = {
            "breakfast": "8:00 AM - 9:00 AM",
            "lunch": "1:00 PM - 2:00 PM",
            "snack": "4:30 PM - 5:30 PM",
            "dinner": "7:30 PM - 8:30 PM"
        }

        chosen_plan[slot] = {
            "meal_id": best_meal["meal_id"],
            "meal": best_meal["meal_name"],
            "diet_type": best_meal["diet_type"],
            "cuisine": best_meal["cuisine"],
            "explanation": best_meal["description"],
            "ingredients": best_meal["ingredients"],
            "serving_size": best_meal["serving_size"],
            "calories": int(round(best_meal["calories"])),
            "protein": float(round(best_meal["protein_g"], 1)),
            "carbs": float(round(best_meal["carbs_g"], 1)),
            "fats": float(round(best_meal["fat_g"], 1)),
            "fiber": float(round(best_meal["fiber_g"], 1)),
            "prep_time": best_meal["preparation_time"],
            "time": meal_times.get(slot, "")
        }

    # Sum planned nutrition
    total_planned_cals = sum(chosen_plan[s]["calories"] for s in meal_order)
    total_planned_pro = round(sum(chosen_plan[s]["protein"] for s in meal_order), 1)
    total_planned_carbs = round(sum(chosen_plan[s]["carbs"] for s in meal_order), 1)
    total_planned_fat = round(sum(chosen_plan[s]["fats"] for s in meal_order), 1)
    total_planned_fiber = round(sum(chosen_plan[s]["fiber"] for s in meal_order), 1)

    planned_totals = {
        "calories": total_planned_cals,
        "protein_g": total_planned_pro,
        "carbs_g": total_planned_carbs,
        "fat_g": total_planned_fat,
        "fiber_g": total_planned_fiber
    }

    # Daily Nutrition Summary (Target vs Planned)
    daily_summary = {
        "calories": {
            "target": round(daily_calories),
            "planned": total_planned_cals,
            "difference": round(total_planned_cals - daily_calories)
        },
        "protein_g": {
            "target": round(daily_macros.get("protein_g", 0), 1),
            "planned": total_planned_pro,
            "difference": round(total_planned_pro - daily_macros.get("protein_g", 0), 1)
        },
        "carbs_g": {
            "target": round(daily_macros.get("carbs_g", 0), 1),
            "planned": total_planned_carbs,
            "difference": round(total_planned_carbs - daily_macros.get("carbs_g", 0), 1)
        },
        "fat_g": {
            "target": round(daily_macros.get("fat_g", 0), 1),
            "planned": total_planned_fat,
            "difference": round(total_planned_fat - daily_macros.get("fat_g", 0), 1)
        }
    }

    # Hydration
    water_target = float(nutrition_targets.get("water_liters", 2.5))
    water_logged = None
    if today_checkin and isinstance(today_checkin, dict):
        w_val = today_checkin.get("waterIntake")
        if w_val is None:
            w_val = today_checkin.get("water")
        if w_val is None:
            w_val = today_checkin.get("water_liters")
        if w_val is not None:
            try:
                water_logged = float(w_val)
            except (ValueError, TypeError):
                water_logged = None

    if water_logged is not None:
        water_remaining = max(0.0, round(water_target - water_logged, 1))
        water_pct = min(100, round((water_logged / water_target) * 100)) if water_target > 0 else 0
        hydration_info = {
            "current_liters": round(water_logged, 1),
            "target_liters": round(water_target, 1),
            "remaining_liters": water_remaining,
            "percentage": water_pct,
            "is_logged": True
        }
    else:
        hydration_info = {
            "current_liters": None,
            "target_liters": round(water_target, 1),
            "remaining_liters": round(water_target, 1),
            "percentage": 0,
            "is_logged": False
        }

    # Contextual goal message
    goal_message = f"Your daily plan provides {total_planned_cals} kcal and {total_planned_pro}g protein, customized for your {goal.replace('_', ' ')} goal."
    if today_checkin:
        cals_logged = today_checkin.get("calories") or today_checkin.get("caloriesConsumed") or 0
        if cals_logged > 0:
            diff = round(daily_calories - cals_logged)
            if diff > 0:
                goal_message = f"Today you have logged {cals_logged} kcal. Aim for your remaining {diff} kcal with these balanced, nutrient-dense meals."
            else:
                goal_message = f"Today you have logged {cals_logged} kcal, fulfilling your {round(daily_calories)} kcal daily target. Prioritize hydration and recovery."

    return {
        "meal_plan": {
            **chosen_plan,
            "goal_message": goal_message
        },
        "planned_totals": planned_totals,
        "summary": daily_summary,
        "hydration": hydration_info
    }
