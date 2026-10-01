import pandas as pd
from pathlib import Path
from threading import Lock

DATASET_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "FitIQ_FitLife360_Cleaned_Foundation.csv"
)

PARTICIPANT_COLUMN = "participant_id"
BEHAVIOR_COLUMNS = (
    "hours_sleep",
    "daily_steps",
    "hydration_level",
    "duration_minutes",
)
_FOUNDATION_DATA = None
_FOUNDATION_DATA_LOCK = Lock()


def load_foundation_data():
    global _FOUNDATION_DATA

    if _FOUNDATION_DATA is None:
        with _FOUNDATION_DATA_LOCK:
            if _FOUNDATION_DATA is None:
                participant_totals = None
                for chunk in pd.read_csv(
                    DATASET_PATH,
                    usecols=[PARTICIPANT_COLUMN, *BEHAVIOR_COLUMNS],
                    dtype={PARTICIPANT_COLUMN: "category"},
                    chunksize=25_000,
                ):
                    chunk_totals = chunk.groupby(
                        PARTICIPANT_COLUMN,
                        observed=True,
                        sort=False,
                    )[list(BEHAVIOR_COLUMNS)].agg(["sum", "count"])
                    participant_totals = (
                        chunk_totals
                        if participant_totals is None
                        else participant_totals.add(
                            chunk_totals,
                            fill_value=0,
                        )
                    )

                participant_sums = participant_totals.xs(
                    "sum",
                    axis=1,
                    level=1,
                )
                participant_counts = participant_totals.xs(
                    "count",
                    axis=1,
                    level=1,
                )
                _FOUNDATION_DATA = participant_sums.div(
                    participant_counts.where(participant_counts > 0)
                ).reset_index()

    return _FOUNDATION_DATA

def calculate_pearson_correlation(x_values, y_values):

    if len(x_values) != len(y_values):
        return None

    if len(x_values) < 2:
        return None

    x_mean = sum(x_values) / len(x_values)
    y_mean = sum(y_values) / len(y_values)

    numerator = sum(
        (x - x_mean) * (y - y_mean)
        for x, y in zip(x_values, y_values)
    )

    x_squared_sum = sum(
        (x - x_mean) ** 2
        for x in x_values
    )

    y_squared_sum = sum(
        (y - y_mean) ** 2
        for y in y_values
    )

    denominator = (x_squared_sum * y_squared_sum) ** 0.5

    if denominator == 0:
        return None

    return numerator / denominator


def calculate_population_patterns(df):

    relationships = {
        "sleep_steps": ("hours_sleep", "daily_steps"),
        "sleep_exercise": ("hours_sleep", "duration_minutes"),
        "hydration_steps": ("hydration_level", "daily_steps"),
        "hydration_exercise": ("hydration_level", "duration_minutes")
    }

    patterns = []

    for name, (column_x, column_y) in relationships.items():

        data = df[[column_x, column_y]].dropna()

        x_values = data[column_x].tolist()
        y_values = data[column_y].tolist()

        correlation = calculate_pearson_correlation(
            x_values,
            y_values
        )

        patterns.append({
            "relationship": name,
            "correlation": round(correlation, 2)
                if correlation is not None else None
        })

    return patterns

def inspect_behavior_columns(df):

    columns = [
        "hours_sleep",
        "daily_steps",
        "hydration_level",
        "duration_minutes"
    ]

    for column in columns:
        print(f"\n{column}")
        print("Min:", df[column].min())
        print("Max:", df[column].max())
        print("Mean:", round(df[column].mean(), 2))
        print("Unique values:", df[column].nunique())

def calculate_participant_level_patterns(df):

    participant_data = df.groupby("participant_id")[
        [
            "hours_sleep",
            "daily_steps",
            "hydration_level",
            "duration_minutes"
        ]
    ].mean()

    relationships = {
        "sleep_steps": ("hours_sleep", "daily_steps"),
        "sleep_exercise": ("hours_sleep", "duration_minutes"),
        "hydration_steps": ("hydration_level", "daily_steps"),
        "hydration_exercise": ("hydration_level", "duration_minutes")
    }

    patterns = []

    for name, (column_x, column_y) in relationships.items():

        data = participant_data[[column_x, column_y]].dropna()

        x_values = data[column_x].tolist()
        y_values = data[column_y].tolist()

        correlation = calculate_pearson_correlation(
            x_values,
            y_values
        )

        patterns.append({
            "relationship": name,
            "correlation": round(correlation, 2)
                if correlation is not None else None,
            "strength": classify_correlation(correlation)
        })

    return patterns
def classify_correlation(correlation):

    if correlation is None:
        return "Insufficient data"

    if correlation >= 0.7:
        return "Strong positive"

    elif correlation >= 0.3:
        return "Moderate positive"

    elif correlation > -0.3:
        return "Weak or no relationship"

    elif correlation > -0.7:
        return "Moderate negative"

    else:
        return "Strong negative"

def calculate_personal_patterns(tracking_records):

    if tracking_records is None or len(tracking_records) < 7:
        return None

    relationships = {
        "sleep_steps": ("sleepHours", "steps"),
        "sleep_exercise": ("sleepHours", "exerciseMinutes"),
        "hydration_steps": ("waterIntake", "steps"),
        "hydration_exercise": ("waterIntake", "exerciseMinutes")
    }

    patterns = []

    for name, (column_x, column_y) in relationships.items():

        valid_records = []

        for record in tracking_records:

            x = record.get(column_x)
            y = record.get(column_y)

            if x is not None and y is not None:
                try:
                    x = float(x)
                    y = float(y)

                    if x >= 0 and y >= 0:
                        valid_records.append((x, y))

                except (ValueError, TypeError):
                    continue

        if len(valid_records) < 2:
            correlation = None
        else:
            x_values = [pair[0] for pair in valid_records]
            y_values = [pair[1] for pair in valid_records]

            correlation = calculate_pearson_correlation(
                x_values,
                y_values
            )

        patterns.append({
            "relationship": name,
            "correlation": round(correlation, 2)
                if correlation is not None else None,
            "strength": classify_correlation(correlation)
                if correlation is not None else "Insufficient data"
        })

    return patterns
def analyze_behavior(tracking_records, foundation_df):

    if tracking_records is not None and len(tracking_records) >= 7:

        personal_patterns = calculate_personal_patterns(
            tracking_records
        )

        return {
            "mode": "personal",
            "patterns": personal_patterns
        }

    if foundation_df is None:
        foundation_df = load_foundation_data()

    population_patterns = calculate_participant_level_patterns(
        foundation_df
    )

    return {
        "mode": "population",
        "patterns": population_patterns
    }

if __name__ == "__main__":

    test_records = [
        {"sleepHours": 7, "steps": 7000, "exerciseMinutes": 30, "waterIntake": 2.0},
        {"sleepHours": 8, "steps": 8000, "exerciseMinutes": 40, "waterIntake": 2.5},
        {"sleepHours": 7.5, "steps": 7500, "exerciseMinutes": 35, "waterIntake": 2.2}
    ]

    df = load_foundation_data()

    result = analyze_behavior(
        test_records,
        df
    )

    print(result)