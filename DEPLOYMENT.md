# FitIQ web production deployment

## Current deployment state

- The existing Flask API is `https://fitiq-api-brlo.onrender.com`.
- The Render API service is configured on the Free plan in `render.yaml`.
- The React website is not currently deployed. `frontend/.env.production` points the
  production React build at the existing API; it does not publish the website.
- Until a public website origin exists, the API CORS allowlist contains only the two
  explicit Create React App development origins in `render.yaml`. It does not allow
  `https://localhost` or arbitrary origins.

## Deploy the existing React website

The frontend is a Create React App project in `frontend/`. A Render Static Site can
serve the built files without changing the React or Flask architecture:

1. In Render, create a **Static Site** from the same repository and the branch intended
   for production.
2. Set the root directory to `frontend`.
3. Use `npm ci` as the build command and `build` as the publish directory. The
   `REACT_APP_BACKEND_URL` value is read at build time from `.env.production` and must
   remain `https://fitiq-api-brlo.onrender.com`.
4. Add an SPA rewrite from `/*` to `/index.html` so direct visits and refreshes on React
   routes such as `/dashboard` are served by the React router.
5. Record the exact HTTPS origin Render assigns to the published site. Do not guess or
   substitute a hostname.
6. Add that exact origin to `FITIQ_CORS_ORIGINS` in `render.yaml` and the Render API
   service environment. Retain only explicitly approved development origins if needed;
   do not use `*`.
7. Deploy the API configuration and website, then verify the API endpoints and browser
   preflight from the published website origin.

No public frontend origin can be configured or production browser CORS verified before
the static site has been created and Render has assigned its actual URL.

## Backend service

The `fitiq-api` Render web service uses:

- Plan: Free
- Health check: `/health`
- Start command: `gunicorn --chdir backend --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120 app:app`
- CORS: comma-separated exact origins in `FITIQ_CORS_ORIGINS`

Render supplies `PORT`. The backend reads optional LLM keys (`GEMINI_API_KEY`,
`LLM_API_KEY`, or `OPENAI_API_KEY`) from server environment variables only. Never put
these secrets in React environment variables, the repository, or a client build.

Firebase Authentication and Firestore are used by the existing React client. The Flask
backend does not use Firebase Admin credentials. Keep Firestore security rules scoped to
the authenticated user's records.

## Local web development against the production API

From PowerShell:

```powershell
Set-Location "C:\path\to\FitIQ\frontend"
npm ci
npm start
```

The development server runs on `http://localhost:3000`; the backend URL is centralized
in `src/config/api.js` and the production build setting remains in `.env.production`.
For browser calls from local development, the Render API must allow the exact local
development origin in `FITIQ_CORS_ORIGINS`. This is not a production website origin.

## Smoke checks

```powershell
Invoke-RestMethod "https://fitiq-api-brlo.onrender.com/health"
```

The expected health response is `status: ok`. After deployment, test all API routes and
browser CORS from the actual published website origin; successful local tests alone do
not verify production operation.
