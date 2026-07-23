## Key Features

- **Automated daily reminders** — no manual intervention required once a patient is enrolled
- **Risk-based prioritization** — health workers see who needs attention first, not a flat list
- **LangGraph agent harness** — role-scoped patient/doctor agents with a multi-provider fallback chain (Hermes → Gemini → mock), so the assistant keeps working even if a provider goes down
- **AI-guarded Q&A** — patients get real answers without risk of unsafe medical advice
- **AI-assisted doctor workflows** — drafts escalation summaries and treatment-suggestion notes for doctor review (never auto-executed)
- **Escalation queue** — missed doses/symptoms auto-generate actionable alerts
- **Interactive Simulator** — demonstrates the full patient-bot-dashboard loop for testing/demo purposes without needing live WhatsApp access
- **Adherence reporting** — exportable metrics for program tracking
- **PII encryption at rest** — patient names/phones encrypted (AES-256-GCM), DPDP-compliant data retention/purge

## Running Locally

**Prerequisites:** Node.js, a PostgreSQL database (local or hosted)

```bash
# Install dependencies
npm install

# Push the database schema
npx drizzle-kit push --config=src/db/drizzle.config.ts

# Start the app (frontend + backend together)
npm run dev
```

The app runs at `http://localhost:3000` and auto-seeds demo health worker + patient accounts on first boot.

Environment variables required (see `.env.example`, copy to a file literally named `.env`):

- `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_PORT` — Postgres connection
- `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` — used by `drizzle-kit push` for schema migrations
- `JWT_SECRET`, `ENCRYPTION_KEY` — auth and PII encryption
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — optional; without these, message sends run in simulation mode (logged to console instead of actually sent)
- `GEMINI_API_KEY` — optional; powers the Gemini fallback tier of the agent layer
- Hermes 4 endpoint config (see `src/agents/hermesClient.ts`) — optional; when unset, the agent layer automatically falls back to Gemini, then to a deterministic mock
- `APP_URL` — must match your public URL exactly if testing inbound Twilio webhooks (e.g. via [ngrok](https://ngrok.com) for local development), since it's used for Twilio signature verification

**Note on tests:** `npm run test:hermes` includes a few integration tests that require a live PostgreSQL connection with a seeded schema; these will fail (as connection errors, not code errors) in environments without one, such as a fresh CI runner.

## Disclaimer

This software is an adherence analytics and outreach tool. It does not provide medical diagnosis, treatment, or prescriptions. All AI-drafted content (patient Q&A, doctor-side summaries and suggestions) is either guardrailed to refuse medical advice, or requires explicit human sign-off before any action is taken. For any medical concern, patients are directed to contact their assigned health worker or public health center.

## Acknowledgements

Built as part of the **IBM SkillsBuild Academic Internship** in partnership with **AICTE** and **CSRBOX**, under the AI Automation & Intelligent Solutions track.