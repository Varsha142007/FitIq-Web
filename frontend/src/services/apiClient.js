import axios from "axios";
import BACKEND_URL from "../config/api";

const API_TIMEOUT_MS = 20000;

const getBackendUrl = (path) => {
  if (!BACKEND_URL) {
    throw new Error(
      "FitIQ backend URL is not configured. Set REACT_APP_BACKEND_URL and rebuild the app."
    );
  }

  return `${BACKEND_URL}/${path.replace(/^\/+/, "")}`;
};

export async function fetchBackend(path, options = {}) {
  const url = getBackendUrl(path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `The FitIQ backend request timed out after ${API_TIMEOUT_MS / 1000} seconds. Check that Flask is reachable at ${BACKEND_URL}.`
      );
    }

    throw new Error(
      "Unable to connect to FitIQ server. Please try again."
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postBackend(path, payload) {
  const url = getBackendUrl(path);

  try {
    return await axios.post(url, payload, { timeout: API_TIMEOUT_MS });
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error(
        `The FitIQ backend request timed out after ${API_TIMEOUT_MS / 1000} seconds. Check that Flask is reachable at ${BACKEND_URL}.`
      );
    }
    if (!error.response) {
      throw new Error(
        "Unable to connect to FitIQ server. Please try again."
      );
    }
    throw new Error(
      error.response.data?.message ||
        error.response.data?.error ||
        error.message
    );
  }
}
