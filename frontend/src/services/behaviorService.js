import { fetchBackend } from "./apiClient";

export const analyzeBehavior = async (trackingRecords) => {
  const response = await fetchBackend("/behavior", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trackingRecords: trackingRecords || [],
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to analyze behavior");
  }

  return await response.json();
};