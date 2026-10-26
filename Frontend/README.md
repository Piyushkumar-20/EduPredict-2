# EduPredict AI — Frontend

React + TypeScript + Vite + shadcn/ui dashboard for the EduPredict AI student-support benchmark.

## Requirements
- Node.js compatible with the versions in `package.json`
- The EduPredict FastAPI backend running from the project root

## Setup (Windows PowerShell)
```powershell
cd Frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The frontend defaults to port `5173` and the backend URL `http://127.0.0.1:8000`. Set `FRONTEND_PORT` in `Frontend/.env` to choose the Vite dev/preview port. Set `VITE_API_BASE_URL` there to match the backend URL; restart Vite after changing `.env`.

## Features
- Responsive overview with classification, attendance alerts, and illustrative chart
- Searchable student directory with profile details and independent attendance alert
- Single-student assessment using `POST /predict`
- CSV preview, batch predictions through `POST /predict-batch`, and result export
- Personalized support-plan UI wired to `POST /recommendations` when that backend endpoint is implemented
- Light/dark theme toggle

## Important limitations
- The bundled dashboard rows and trend chart are illustrative UI demo data. They are not real students or historical measurements.
- The bundled model is trained on synthetic data and is not validated for real-world student-risk decisions. See the root `README.md` and `FACULTY_GUIDE.md`.
- `POST /recommendations` is not included in the current FastAPI backend; the recommendation screen clearly reports this until you implement it. If adding an LLM provider, keep API keys in backend environment variables—never put them in `VITE_*` variables.
- Batch endpoint accepts at most 500 records per request. CSV input should contain `GPA` on a 0–10 scale and `attendance_rate` as a fraction from 0–1 or percentage. Other available fields are described in the root `README.md`.

## Build
```powershell
npm run build
npm run lint
```
