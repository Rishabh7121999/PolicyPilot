
Terminal 1 — backend:
cd /Users/rishabhsingh/Developer/insurance_voicebot
uv sync
uv run uvicorn backend.main:app --reload

Terminal 2 — frontend:
cd /Users/rishabhsingh/Developer/insurance_voicebot/frontend
npm install
npm run dev

Then open the Vite dev URL (typically http://localhost:5173). The frontend talks to the backend at http://localhost:8000 by default.
