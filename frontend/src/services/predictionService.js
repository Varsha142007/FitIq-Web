import { fetchBackend } from "./apiClient";

export async function getPrediction(predictionInput) {
  try {
    const response = await fetchBackend("/prediction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(predictionInput),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Prediction failed");
    }

    return data;
  } catch (error) {
    console.error("Prediction error:", error);
    throw error;
  }
}