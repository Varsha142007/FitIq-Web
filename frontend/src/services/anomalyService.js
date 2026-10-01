import { postBackend } from "./apiClient";

export const getAnomalyAnalysis = async (trackingRecords) => {
  try {
    const response = await postBackend("/anomaly", { trackingRecords });

    return response.data;

  } catch (error) {

    console.error(
      "Error fetching activity pattern analysis:",
      error
    );

    throw new Error(
      error.response?.data?.message ||
      "Failed to analyze your activity pattern."
    );
  }
};