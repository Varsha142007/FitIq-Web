const configuredBackendUrl = process.env.REACT_APP_BACKEND_URL?.trim();
const developmentFallback =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

const BACKEND_URL = (configuredBackendUrl || developmentFallback).replace(
  /\/+$/,
  ""
);

if (process.env.NODE_ENV === "production" && !BACKEND_URL) {
  throw new Error(
    "REACT_APP_BACKEND_URL must be set to the deployed FitIQ backend before a production build."
  );
}

if (process.env.NODE_ENV === "production") {
  const backendUrl = new URL(BACKEND_URL);
  if (!["http:", "https:"].includes(backendUrl.protocol)) {
    throw new Error("REACT_APP_BACKEND_URL must use HTTP or HTTPS.");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(backendUrl.hostname)) {
    throw new Error(
      "REACT_APP_BACKEND_URL cannot point to localhost in a production build."
    );
  }
}

export default BACKEND_URL;
