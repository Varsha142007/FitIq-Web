import { fetchBackend } from "./apiClient";

export async function getConsistencyPrediction(trackingRecords) {
  try {
    const response = await fetchBackend(
      "/consistency-prediction",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingRecords,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Consistency prediction failed"
      );
    }

    return data;
  } catch (error) {
    console.error(
      "Consistency prediction error:",
      error
    );

    throw error;
  }
}