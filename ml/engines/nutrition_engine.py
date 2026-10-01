from pathlib import Path
from threading import Lock
import pandas as pd


# ============================================================
# DATA PATH
# ============================================================

DATA_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "nutrition"
    / "processed"
    / "FitIQ_Nutrition_Cleaned.csv"
)
_PREPARED_NUTRITION_DF = None
_PREPARED_NUTRITION_DF_LOCK = Lock()


# ============================================================
# BMR
# ============================================================

def calculate_bmr(age, gender, height_cm, weight_kg):
    """Calculate BMR using the Mifflin-St Jeor equation."""

    if str(gender).lower() in ["male", "m"]:
        return (
            (10 * weight_kg)
            + (6.25 * height_cm)
            - (5 * age)
            + 5
        )

    return (
        (10 * weight_kg)
        + (6.25 * height_cm)
        - (5 * age)
        - 161
    )


# ============================================================
# TDEE
# ============================================================

def calculate_tdee(bmr, activity_level):
    """Calculate estimated daily energy expenditure."""

    multipliers = {
        "sedentary": 1.20,
        "light": 1.375,
        "lightly active": 1.375,
        "moderate": 1.55,
        "moderately active": 1.55,
        "active": 1.725,
        "very active": 1.90
    }

    multiplier = multipliers.get(
        str(activity_level).lower(),
        1.375
    )

    return bmr * multiplier


# ============================================================
# CALORIE TARGET
# ============================================================

def calculate_calorie_target(tdee, goal):
    """Calculate a practical daily calorie target."""

    goal = str(goal).lower().strip()

    if goal in [
        "weight loss",
        "weight_loss",
        "lose weight",
        "fat loss",
        "loss"
    ]:
        target = tdee - 300

    elif goal in [
        "muscle gain",
        "muscle_gain",
        "weight gain",
        "weight_gain",
        "gain weight",
        "gain",
        "muscle building"
    ]:
        target = tdee + 300

    else:
        target = tdee

    return max(round(target), 1200)


# ============================================================
# MACROS
# ============================================================

def calculate_macros(calorie_target, goal):
    """Calculate daily protein, carbohydrate and fat targets."""

    goal = str(goal).lower().strip()

    if goal in [
        "muscle gain",
        "muscle_gain",
        "weight gain",
        "weight_gain",
        "gain weight",
        "gain",
        "muscle building"
    ]:
        protein_pct = 0.25
        carb_pct = 0.50
        fat_pct = 0.25

    elif goal in [
        "weight loss",
        "weight_loss",
        "lose weight",
        "fat loss",
        "loss"
    ]:
        protein_pct = 0.30
        carb_pct = 0.40
        fat_pct = 0.30

    else:
        protein_pct = 0.25
        carb_pct = 0.45
        fat_pct = 0.30

    return {
        "protein_g": round(
            (calorie_target * protein_pct) / 4,
            1
        ),
        "carbs_g": round(
            (calorie_target * carb_pct) / 4,
            1
        ),
        "fat_g": round(
            (calorie_target * fat_pct) / 9,
            1
        )
    }


# ============================================================
# DIET CLASSIFICATION
# ============================================================

def classify_food(food_name, food_category):
    """
    Classify a food as vegan, vegetarian, or non_vegetarian.

    USDA food category is used as the primary signal.
    Food name is used as a fallback for ambiguous categories.

    This prevents the system from depending on a huge list of
    individual fish/meat names.
    """

    name = str(food_name).lower().strip()
    category = str(food_category).lower().strip()

    # --------------------------------------------------------
    # 1. DEFINITE NON-VEGETARIAN USDA CATEGORIES
    # --------------------------------------------------------

    nonveg_categories = [
        "poultry",
        "finfish",
        "shellfish",
        "fish",
        "meat",
        "beef",
        "pork",
        "lamb",
        "mutton",
        "veal",
        "game",
        "animal products"
    ]

    if any(word in category for word in nonveg_categories):
        return "non_vegetarian"

    # --------------------------------------------------------
    # 2. DAIRY + EGG CATEGORY NEEDS NAME-LEVEL CHECK
    # --------------------------------------------------------

    if "dairy and egg" in category:
        egg_words = [
            "egg",
            "eggs",
            "egg white",
            "egg yolk",
            "albumen"
        ]

        if any(word in name for word in egg_words):
            return "non_vegetarian"

        return "vegetarian"

    # --------------------------------------------------------
    # 3. OTHER CLEAR NON-VEGETARIAN NAME SIGNALS
    # --------------------------------------------------------

    nonveg_words = [
        "chicken",
        "turkey",
        "beef",
        "pork",
        "lamb",
        "mutton",
        "goat meat",
        "duck",
        "veal",
        "bison",
        "rabbit",

        "fish",
        "salmon",
        "tuna",
        "sardine",
        "sardines",
        "anchovy",
        "anchovies",
        "snapper",
        "trout",
        "tilapia",
        "cod",
        "haddock",
        "herring",
        "mackerel",
        "catfish",
        "bass",
        "carp",
        "perch",
        "pollock",
        "halibut",
        "swordfish",
        "mahi",
        "flounder",
        "squid",
        "calamari",

        "shrimp",
        "prawn",
        "crab",
        "lobster",
        "oyster",
        "clam",
        "scallop",
        "mussel",
        "shellfish",

        "meat",
        "liver",
        "bacon",
        "ham",
        "sausage",
        "salami",
        "pepperoni",
        "hot dog"
    ]

    if any(word in name for word in nonveg_words):
        return "non_vegetarian"

    # --------------------------------------------------------
    # 4. DEFINITE VEGETARIAN CATEGORIES
    # --------------------------------------------------------

    vegetarian_categories = [
        "dairy",
        "legumes and legume products",
        "vegetables and vegetable products",
        "fruits and fruit juices",
        "cereal grains and pasta",
        "nut and seed products"
    ]

    if any(word in category for word in vegetarian_categories):
        return "vegetarian" if "dairy" in category else "vegan"

    # --------------------------------------------------------
    # 5. VEGETARIAN NAME FALLBACK
    # --------------------------------------------------------

    vegetarian_words = [
        "milk",
        "cheese",
        "yogurt",
        "yoghurt",
        "curd",
        "butter",
        "cream",
        "ghee",
        "whey",
        "casein",
        "paneer",
        "cottage cheese"
    ]

    if any(word in name for word in vegetarian_words):
        return "vegetarian"

    # --------------------------------------------------------
    # 6. DEFAULT
    # --------------------------------------------------------

    # Foundation Foods that are not identified as animal-derived
    # are treated as plant-based by default.
    return "vegan"


# ============================================================
# LOAD DATA
# ============================================================

def load_nutrition_data():
    """Load the processed USDA Foundation Foods dataset."""

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Nutrition dataset not found:\n{DATA_PATH}"
        )

    df = pd.read_csv(
        DATA_PATH,
        low_memory=False
    )

    required_columns = [
        "fdc_id",
        "food_name",
        "food_category",
        "calories_kcal",
        "protein_g",
        "fat_g",
        "carbohydrate_g",
        "fiber_g",
        "sugar_g",
        "sodium_mg"
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing nutrition columns: {missing_columns}"
        )

    return df


# ============================================================
# PREPARE FOOD DATA
# ============================================================

def prepare_food_data(df):
    """Clean and prepare food records."""

    df = df.copy()

    numeric_columns = [
        "calories_kcal",
        "protein_g",
        "fat_g",
        "carbohydrate_g",
        "fiber_g",
        "sugar_g",
        "sodium_mg"
    ]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    # --------------------------------------------------------
    # Missing nutrient values
    # --------------------------------------------------------

    for column in [
        "protein_g",
        "fat_g",
        "carbohydrate_g",
        "fiber_g",
        "sugar_g",
        "sodium_mg"
    ]:
        df[column] = df[column].fillna(0)

    # --------------------------------------------------------
    # Calories are required
    # --------------------------------------------------------

    df = df[
        df["calories_kcal"].notna()
        & (df["calories_kcal"] > 0)
    ].copy()

    # --------------------------------------------------------
    # Remove empty food names
    # --------------------------------------------------------

    df = df[
        df["food_name"].notna()
        & (
            df["food_name"]
            .astype(str)
            .str.strip()
            != ""
        )
    ].copy()

    # --------------------------------------------------------
    # Diet classification
    # --------------------------------------------------------

    df["diet_type"] = df.apply(
        lambda row: classify_food(
            row["food_name"],
            row["food_category"]
        ),
        axis=1
    )

    # --------------------------------------------------------
    # Remove obvious non-food / supplement entries
    # --------------------------------------------------------

    excluded_words = [
        "supplement",
        "extract",
        "isolate",
        "capsule",
        "tablet",
        "flavoring",
        "flavouring",
        "vitamin supplement",
        "mineral supplement",
        "protein powder"
    ]

    pattern = "|".join(excluded_words)

    df = df[
        ~df["food_name"]
        .astype(str)
        .str.lower()
        .str.contains(
            pattern,
            regex=True,
            na=False
        )
    ].copy()

    return df.reset_index(drop=True)


# ============================================================
# FOOD SCORING
# ============================================================

def score_foods(df):
    """
    Calculate the base nutrition score from 0-100.

    Components:
    - Protein: 40%
    - Fiber: 25%
    - Lower sugar: 20%
    - Lower sodium: 15%
    """

    df = df.copy()

    if df.empty:
        return df

    protein_max = df["protein_g"].quantile(0.95)
    fiber_max = df["fiber_g"].quantile(0.95)
    sugar_max = df["sugar_g"].quantile(0.95)
    sodium_max = df["sodium_mg"].quantile(0.95)

    if protein_max > 0:
        protein_score = (
            df["protein_g"] / protein_max
        ).clip(0, 1)
    else:
        protein_score = 0

    if fiber_max > 0:
        fiber_score = (
            df["fiber_g"] / fiber_max
        ).clip(0, 1)
    else:
        fiber_score = 0

    if sugar_max > 0:
        sugar_score = (
            1 - (df["sugar_g"] / sugar_max)
        ).clip(0, 1)
    else:
        sugar_score = 1

    if sodium_max > 0:
        sodium_score = (
            1 - (df["sodium_mg"] / sodium_max)
        ).clip(0, 1)
    else:
        sodium_score = 1

    df["score"] = (
        protein_score * 0.40
        + fiber_score * 0.25
        + sugar_score * 0.20
        + sodium_score * 0.15
    ) * 100

    df["score"] = df["score"].round(1)

    return df


# ============================================================
# PRACTICALITY SCORE
# ============================================================

def calculate_practicality_score(df):
    """
    Estimate how practical a food is for a normal fitness user.

    Higher score:
    - common whole foods
    - common protein sources
    - fruits/vegetables
    - grains
    - legumes
    - nuts/seeds

    Lower score:
    - flour
    - bran
    - powders
    - extracts
    - concentrates
    - highly processed meats
    - heavily dried/concentrated products
    """

    df = df.copy()

    df["practicality_score"] = 50.0

    names = (
        df["food_name"]
        .astype(str)
        .str.lower()
    )

    categories = (
        df["food_category"]
        .astype(str)
        .str.lower()
    )

    # --------------------------------------------------------
    # Practical food names
    # --------------------------------------------------------

    practical_foods = [
        "chicken",
        "turkey",
        "fish",
        "salmon",
        "tuna",
        "sardine",
        "egg",
        "milk",
        "yogurt",
        "yoghurt",
        "curd",
        "paneer",
        "cottage cheese",
        "tofu",
        "tempeh",
        "lentil",
        "bean",
        "chickpea",
        "peas",
        "rice",
        "oat",
        "potato",
        "sweet potato",
        "banana",
        "apple",
        "orange",
        "berry",
        "spinach",
        "carrot",
        "broccoli",
        "tomato",
        "cucumber",
        "vegetable",
        "fruit",
        "almond",
        "peanut",
        "pistachio",
        "walnut",
        "cashew",
        "pumpkin seed",
        "sunflower seed",
        "flaxseed",
        "chia seed"
    ]

    for keyword in practical_foods:
        mask = names.str.contains(
            keyword,
            regex=False,
            na=False
        )

        df.loc[
            mask,
            "practicality_score"
        ] += 10

    # --------------------------------------------------------
    # Ingredient-like foods
    # --------------------------------------------------------

    ingredient_words = [
        "flour",
        "bran",
        "starch",
        "powder",
        "concentrate",
        "isolate",
        "extract"
    ]

    for keyword in ingredient_words:
        mask = names.str.contains(
            keyword,
            regex=False,
            na=False
        )

        df.loc[
            mask,
            "practicality_score"
        ] -= 30

    # --------------------------------------------------------
    # Dried/concentrated products
    # --------------------------------------------------------

    dried_mask = names.str.contains(
        "dried",
        regex=False,
        na=False
    )

    df.loc[
        dried_mask,
        "practicality_score"
    ] -= 15

    # --------------------------------------------------------
    # Processed meat
    # --------------------------------------------------------

    processed_meat_words = [
        "bacon",
        "sausage",
        "hot dog",
        "salami",
        "pepperoni",
        "cured"
    ]

    for keyword in processed_meat_words:
        mask = names.str.contains(
            keyword,
            regex=False,
            na=False
        )

        df.loc[
            mask,
            "practicality_score"
        ] -= 20

    # --------------------------------------------------------
    # Category bonus
    # --------------------------------------------------------

    useful_categories = [
        "dairy and egg products",
        "legumes and legume products",
        "vegetables and vegetable products",
        "fruits and fruit juices",
        "cereal grains and pasta",
        "nut and seed products",
        "poultry products",
        "finfish and shellfish products"
    ]

    for keyword in useful_categories:
        mask = categories.str.contains(
            keyword,
            regex=False,
            na=False
        )

        df.loc[
            mask,
            "practicality_score"
        ] += 5

    df["practicality_score"] = (
        df["practicality_score"]
        .clip(0, 100)
    )

    return df


def load_prepared_nutrition_data():
    """Prepare the USDA food table once per worker process."""
    global _PREPARED_NUTRITION_DF

    if _PREPARED_NUTRITION_DF is None:
        with _PREPARED_NUTRITION_DF_LOCK:
            if _PREPARED_NUTRITION_DF is None:
                df = prepare_food_data(load_nutrition_data())
                df = score_foods(df)
                _PREPARED_NUTRITION_DF = calculate_practicality_score(df)

    return _PREPARED_NUTRITION_DF


# ============================================================
# DIET FILTER
# ============================================================

def filter_by_diet(df, diet_type):
    """Filter foods according to the user's diet."""

    diet_type = str(diet_type).lower().strip()

    if diet_type == "vegan":
        return df[
            df["diet_type"] == "vegan"
        ].copy()

    if diet_type == "vegetarian":
        return df[
            df["diet_type"].isin(
                ["vegan", "vegetarian"]
            )
        ].copy()

    # Mixed and non-vegetarian can use all foods.
    return df.copy()


# ============================================================
# GOAL NORMALIZATION
# ============================================================

def normalize_goal(goal):
    """Normalize different goal spellings."""

    goal = str(goal).lower().strip()

    if goal in [
        "weight loss",
        "weight_loss",
        "lose weight",
        "fat loss",
        "loss"
    ]:
        return "weight_loss"

    if goal in [
        "muscle gain",
        "muscle_gain",
        "weight gain",
        "weight_gain",
        "gain weight",
        "gain",
        "muscle building"
    ]:
        return "muscle_gain"

    return "maintenance"


# ============================================================
# FOOD GROUP
# ============================================================

def get_food_group(food_name, category, diet_type):
    """
    Assign a broad food group for recommendation diversity.

    USDA category is used where possible.
    """

    name = str(food_name).lower()
    category = str(category).lower()

    # --------------------------------------------------------
    # Animal protein
    # --------------------------------------------------------

    if any(word in category for word in [
        "poultry",
        "finfish",
        "shellfish",
        "meat"
    ]):
        return "protein"

    if any(word in name for word in [
        "chicken",
        "turkey",
        "fish",
        "salmon",
        "tuna",
        "sardine",
        "egg",
        "beef",
        "pork",
        "lamb",
        "shrimp",
        "prawn",
        "crab",
        "squid"
    ]):
        return "protein"

    # --------------------------------------------------------
    # Plant protein
    # --------------------------------------------------------

    if "legume" in category:
        return "plant_protein"

    if any(word in name for word in [
        "lentil",
        "bean",
        "chickpea",
        "pea",
        "tofu",
        "tempeh"
    ]):
        return "plant_protein"

    # --------------------------------------------------------
    # Dairy
    # --------------------------------------------------------

    if "dairy" in category:
        return "dairy"

    if any(word in name for word in [
        "milk",
        "cheese",
        "yogurt",
        "yoghurt",
        "curd",
        "paneer"
    ]):
        return "dairy"

    # --------------------------------------------------------
    # Fruits
    # --------------------------------------------------------

    if "fruit" in category:
        return "fruit"

    if any(word in name for word in [
        "apple",
        "banana",
        "orange",
        "berry",
        "grape",
        "mango",
        "fruit"
    ]):
        return "fruit"

    # --------------------------------------------------------
    # Vegetables
    # --------------------------------------------------------

    if "vegetable" in category:
        return "vegetable"

    if any(word in name for word in [
        "spinach",
        "broccoli",
        "carrot",
        "tomato",
        "potato",
        "cucumber",
        "vegetable"
    ]):
        return "vegetable"

    # --------------------------------------------------------
    # Grains
    # --------------------------------------------------------

    if any(word in category for word in [
        "cereal",
        "grain",
        "pasta"
    ]):
        return "grain"

    if any(word in name for word in [
        "rice",
        "oat",
        "wheat",
        "barley",
        "corn",
        "cereal"
    ]):
        return "grain"

    # --------------------------------------------------------
    # Nuts and seeds
    # --------------------------------------------------------

    if "nut and seed" in category:
        return "nuts_seeds"

    if any(word in name for word in [
        "peanut",
        "almond",
        "walnut",
        "pistachio",
        "cashew",
        "seed",
        "flax",
        "chia",
        "pumpkin"
    ]):
        return "nuts_seeds"

    return "other"


# ============================================================
# RECOMMENDATIONS
# ============================================================

def get_recommendations(df, diet_type, goal, limit=6):
    """
    Generate diverse, practical, goal-aware recommendations.

    Pipeline:

    1. Diet filtering
    2. Nutrition scoring
    3. Goal scoring
    4. Practicality scoring
    5. Calorie/ingredient/processed penalties
    6. Diversity-aware selection
    """

    # --------------------------------------------------------
    # Normalize inputs
    # --------------------------------------------------------

    diet_type = str(diet_type).lower().strip()
    goal = normalize_goal(goal)

    # --------------------------------------------------------
    # 1. Apply diet filter FIRST
    # --------------------------------------------------------

    data = filter_by_diet(
        df,
        diet_type
    )

    if data.empty:
        return []

    data = data.copy()

    # --------------------------------------------------------
    # 2. Nutrition score
    # --------------------------------------------------------

    data["nutrition_score"] = (
        data["score"].fillna(0)
    )

    # --------------------------------------------------------
    # 3. Goal-specific score
    # --------------------------------------------------------

    protein = data["protein_g"].fillna(0)
    fiber = data["fiber_g"].fillna(0)

    protein_max = max(
        float(protein.quantile(0.95)),
        1
    )

    fiber_max = max(
        float(fiber.quantile(0.95)),
        1
    )

    data["protein_component"] = (
        protein / protein_max * 100
    ).clip(0, 100)

    data["fiber_component"] = (
        fiber / fiber_max * 100
    ).clip(0, 100)

    if goal == "muscle_gain":

        data["goal_score"] = (
            data["nutrition_score"] * 0.60
            + data["protein_component"] * 0.40
        )

    elif goal == "weight_loss":

        data["goal_score"] = (
            data["nutrition_score"] * 0.60
            + data["fiber_component"] * 0.40
        )

    else:

        data["goal_score"] = (
            data["nutrition_score"]
        )

    # --------------------------------------------------------
    # 4. Practicality
    # --------------------------------------------------------

    if "practicality_score" not in data.columns:
        data = calculate_practicality_score(data)

    # --------------------------------------------------------
    # 5. Base final score
    # --------------------------------------------------------

    data["final_score"] = (
        data["goal_score"] * 0.55
        + data["practicality_score"] * 0.45
    )

    # --------------------------------------------------------
    # 6. Goal bonus
    # --------------------------------------------------------

    def goal_bonus(food_name):

        name = str(food_name).lower()

        bonus = 0

        if goal == "muscle_gain":

            protein_foods = [
                "chicken",
                "turkey",
                "fish",
                "salmon",
                "tuna",
                "sardine",
                "egg",
                "yogurt",
                "yoghurt",
                "curd",
                "paneer",
                "cottage cheese",
                "tofu",
                "tempeh",
                "lentil",
                "bean",
                "chickpea",
                "pea"
            ]

            if any(
                word in name
                for word in protein_foods
            ):
                bonus += 8

        elif goal == "weight_loss":

            high_fiber_foods = [
                "lentil",
                "bean",
                "chickpea",
                "pea",
                "vegetable",
                "spinach",
                "broccoli",
                "carrot",
                "tomato",
                "apple",
                "orange",
                "berry",
                "oat"
            ]

            if any(
                word in name
                for word in high_fiber_foods
            ):
                bonus += 8

        return bonus

    data["goal_bonus"] = (
        data["food_name"]
        .apply(goal_bonus)
    )

    data["final_score"] += (
        data["goal_bonus"]
    )

    # --------------------------------------------------------
    # 7. Calorie-density penalty
    # --------------------------------------------------------

    def calorie_penalty(calories):

        if calories >= 700:
            return 15

        if calories >= 600:
            return 10

        if calories >= 500:
            return 6

        if calories >= 400:
            return 3

        return 0

    data["calorie_penalty"] = (
        data["calories_kcal"]
        .apply(calorie_penalty)
    )

    data["final_score"] -= (
        data["calorie_penalty"]
    )

    # --------------------------------------------------------
    # 8. Ingredient penalty
    # --------------------------------------------------------

    ingredient_words = [
        "flour",
        "bran",
        "starch",
        "powder",
        "concentrate",
        "isolate",
        "extract"
    ]

    def ingredient_penalty(food_name):

        name = str(food_name).lower()

        if any(
            word in name
            for word in ingredient_words
        ):
            return 20

        return 0

    data["ingredient_penalty"] = (
        data["food_name"]
        .apply(ingredient_penalty)
    )

    data["final_score"] -= (
        data["ingredient_penalty"]
    )

    # --------------------------------------------------------
    # 9. Processed food penalty
    # --------------------------------------------------------

    processed_words = [
        "bacon",
        "sausage",
        "salami",
        "pepperoni",
        "hot dog",
        "cured",
        "smoked"
    ]

    def processed_penalty(food_name):

        name = str(food_name).lower()

        if any(
            word in name
            for word in processed_words
        ):
            return 20

        return 0

    data["processed_penalty"] = (
        data["food_name"]
        .apply(processed_penalty)
    )

    data["final_score"] -= (
        data["processed_penalty"]
    )

    # --------------------------------------------------------
    # 10. Diet preference bonus
    # --------------------------------------------------------

    def diet_bonus(food_name, current_diet):

        name = str(food_name).lower()

        bonus = 0

        if current_diet == "non_vegetarian":

            if any(
                word in name
                for word in [
                    "chicken",
                    "turkey",
                    "fish",
                    "salmon",
                    "tuna",
                    "sardine",
                    "egg",
                    "shrimp",
                    "prawn"
                ]
            ):
                bonus += 5

        elif current_diet == "vegetarian":

            if any(
                word in name
                for word in [
                    "milk",
                    "yogurt",
                    "yoghurt",
                    "curd",
                    "paneer",
                    "cheese",
                    "lentil",
                    "bean",
                    "chickpea",
                    "peas",
                    "tofu"
                ]
            ):
                bonus += 5

        elif current_diet == "vegan":

            if any(
                word in name
                for word in [
                    "lentil",
                    "bean",
                    "chickpea",
                    "peas",
                    "tofu",
                    "tempeh"
                ]
            ):
                bonus += 5

        return bonus

    data["diet_bonus"] = data[
        "food_name"
    ].apply(
        lambda x: diet_bonus(
            x,
            diet_type
        )
    )

    data["final_score"] += (
        data["diet_bonus"]
    )

    # --------------------------------------------------------
    # 11. Remove clearly unsuitable recommendation entries
    # --------------------------------------------------------

    bad_name_words = [
        "supplement",
        "extract",
        "isolate",
        "capsule",
        "tablet",
        "protein powder",
        "vitamin supplement",
        "mineral supplement"
    ]

    bad_pattern = "|".join(bad_name_words)

    data = data[
        ~data["food_name"]
        .astype(str)
        .str.lower()
        .str.contains(
            bad_pattern,
            regex=True,
            na=False
        )
    ].copy()

    if data.empty:
        return []

    # --------------------------------------------------------
    # 12. Food groups
    # --------------------------------------------------------

    data["food_group"] = data.apply(
        lambda row: get_food_group(
            row["food_name"],
            row["food_category"],
            diet_type
        ),
        axis=1
    )

    # --------------------------------------------------------
    # 13. Sort candidates
    # --------------------------------------------------------

    data = data.sort_values(
        by=[
            "final_score",
            "protein_g",
            "fiber_g"
        ],
        ascending=[
            False,
            False,
            False
        ]
    ).reset_index(drop=True)

    # --------------------------------------------------------
    # 14. Diverse recommendation selection
    # --------------------------------------------------------

    recommendations = []
    group_counts = {}

    selected_ids = set()

    # First pass:
    # One recommendation from each food group.
    for _, row in data.iterrows():

        group = row["food_group"]

        if group_counts.get(group, 0) >= 1:
            continue

        recommendations.append(row)

        group_counts[group] = 1
        selected_ids.add(row["fdc_id"])

        if len(recommendations) >= limit:
            break

    # Second pass:
    # Allow a second recommendation from useful groups.
    if len(recommendations) < limit:

        for _, row in data.iterrows():

            if row["fdc_id"] in selected_ids:
                continue

            group = row["food_group"]

            if group_counts.get(group, 0) >= 2:
                continue

            recommendations.append(row)

            group_counts[group] = (
                group_counts.get(group, 0) + 1
            )

            selected_ids.add(
                row["fdc_id"]
            )

            if len(recommendations) >= limit:
                break

    # --------------------------------------------------------
    # 15. Convert to API-friendly output
    # --------------------------------------------------------

    result = []

    for row in recommendations:

        result.append({
            "food_name": row["food_name"],
            "food_category": row["food_category"],
            "diet_type": row["diet_type"],
            "calories": round(
                float(row["calories_kcal"]),
                1
            ),
            "protein_g": round(
                float(row["protein_g"]),
                1
            ),
            "carbs_g": round(
                float(row["carbohydrate_g"]),
                1
            ),
            "fat_g": round(
                float(row["fat_g"]),
                1
            ),
            "fiber_g": round(
                float(row["fiber_g"]),
                1
            ),
            "sugar_g": round(
                float(row["sugar_g"]),
                1
            ),
            "sodium_mg": round(
                float(row["sodium_mg"]),
                1
            ),
            "score": round(
                min(
                    max(
                        float(row["final_score"]),
                        0
                    ),
                    100
                ),
                1
            )
        })

    return result


# ============================================================
# INSIGHT
# ============================================================

def generate_insight(
    calorie_target,
    macros,
    goal,
    diet_type
):
    """Generate a personalized nutrition insight."""

    goal = normalize_goal(goal)
    diet_type = str(diet_type).lower().strip()

    if goal == "weight_loss":

        goal_text = (
            "Your nutrition target uses a moderate calorie "
            "deficit while keeping protein relatively high."
        )

    elif goal == "muscle_gain":

        goal_text = (
            "Your nutrition target provides a calorie surplus "
            "with higher carbohydrate intake to support training."
        )

    else:

        goal_text = (
            "Your nutrition target is designed to maintain "
            "your current energy intake with balanced macros."
        )

    diet_text = {
        "vegan": (
            "Recommendations are filtered for vegan foods."
        ),

        "vegetarian": (
            "Recommendations include vegetarian and vegan foods."
        ),

        "non_vegetarian": (
            "Recommendations include both plant-based and "
            "animal-based food options."
        ),

        "mixed": (
            "Recommendations include a broad range of foods."
        )

    }.get(
        diet_type,
        "Recommendations are personalized to your diet."
    )

    return (
        f"{goal_text} "
        f"{diet_text} "
        f"Your daily target is approximately "
        f"{calorie_target} kcal with "
        f"{macros['protein_g']} g protein."
    )


# ============================================================
# MAIN E6 ENGINE
# ============================================================

def analyze_nutrition(profile):
    """
    Main E6 Nutritional Intelligence engine.

    Expected profile:

    {
        "age": 21,
        "gender": "female",
        "height_cm": 160,
        "weight_kg": 55,
        "activity_level": "moderate",
        "goal": "maintenance",
        "diet_type": "vegetarian"
    }
    """

    required_fields = [
        "age",
        "gender",
        "height_cm",
        "weight_kg",
        "activity_level",
        "goal",
        "diet_type"
    ]

    missing_fields = [
        field
        for field in required_fields
        if field not in profile
        or profile[field] is None
        or str(profile[field]).strip() == ""
    ]

    if missing_fields:

        return {
            "status": "error",
            "message": (
                f"Missing required profile fields: "
                f"{missing_fields}"
            )
        }

    # --------------------------------------------------------
    # Convert numeric inputs
    # --------------------------------------------------------

    try:

        age = float(
            profile["age"]
        )

        height_cm = float(
            profile["height_cm"]
        )

        weight_kg = float(
            profile["weight_kg"]
        )

    except (ValueError, TypeError):

        return {
            "status": "error",
            "message": (
                "Age, height and weight must be numeric."
            )
        }

    if (
        age <= 0
        or height_cm <= 0
        or weight_kg <= 0
    ):

        return {
            "status": "error",
            "message": (
                "Age, height and weight "
                "must be greater than zero."
            )
        }

    gender = str(
        profile["gender"]
    ).lower().strip()

    activity_level = str(
        profile["activity_level"]
    ).lower().strip()

    goal = str(
        profile["goal"]
    ).lower().strip()

    diet_type = str(
        profile["diet_type"]
    ).lower().strip()

    # --------------------------------------------------------
    # Energy calculations
    # --------------------------------------------------------

    bmr = calculate_bmr(
        age,
        gender,
        height_cm,
        weight_kg
    )

    tdee = calculate_tdee(
        bmr,
        activity_level
    )

    calorie_target = calculate_calorie_target(
        tdee,
        goal
    )

    macros = calculate_macros(
        calorie_target,
        goal
    )

    # --------------------------------------------------------
    # Load and process USDA data
    # --------------------------------------------------------

    try:

        df = load_prepared_nutrition_data()

    except Exception as error:

        return {
            "status": "error",
            "message": (
                f"Unable to process nutrition dataset: "
                f"{error}"
            )
        }

    # --------------------------------------------------------
    # Recommendations
    # --------------------------------------------------------

    recommendations = get_recommendations(
        df,
        diet_type,
        goal,
        limit=6
    )

    if not recommendations:

        return {
            "status": "error",
            "message": (
                f"No suitable food recommendations found "
                f"for diet type: {diet_type}"
            )
        }

    # --------------------------------------------------------
    # Insight
    # --------------------------------------------------------

    insight = generate_insight(
        calorie_target,
        macros,
        goal,
        diet_type
    )

    # --------------------------------------------------------
    # Final E6 output
    # --------------------------------------------------------

    return {
        "status": "success",

        "targets": {
            "bmr": round(
                bmr,
                1
            ),

            "tdee": round(
                tdee,
                1
            ),

            "calorie_target": calorie_target,

            "water_liters": 2.5
        },

        "macro_distribution": macros,

        "diet_type": diet_type,

        "recommendations": recommendations,

        "insight": insight,

        "data_source": (
            "USDA FoodData Central Foundation Foods"
        )
    }