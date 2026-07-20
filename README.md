# Nikshay Saathi — TB Medication Adherence Platform

**IBM SkillsBuild x AICTE x CSRBOX Internship Capstone Project**
Track: AI Automation & Intelligent Solutions

## Overview

Nikshay Saathi is an automated tuberculosis (TB) medication adherence system built for community health workers (ASHA workers) in rural India. TB treatment lasts 6–24 months, and in-person patient visits — once the primary way to check adherence — have dropped sharply due to funding and staffing constraints. This leaves a dangerous gap where patients quietly stop taking medication, risking relapse and drug-resistant TB.

Nikshay Saathi closes that gap by automating the daily "did you take your medicine?" check-in via WhatsApp/SMS, using an AI-driven risk engine to flag which patients actually need a visit — so a health worker's limited time goes to the patients who need it most.

## The Problem

- TB treatment requires strict daily adherence for 6+ months.
- Health worker visit frequency has dropped from ~2x/month to ~1x every 3 months.
- In that gap, patients miss doses, feel "cured" early, or forget — increasing the risk of drug-resistant TB.
- Health workers have no way to know who's at risk without visiting everyone equally.

## The Solution

An automated, AI-assisted adherence pipeline with three components:

### 1. Automated Reminder & Adherence Engine
- A scheduled job (cron) automatically messages every active patient via WhatsApp (SMS fallback) at set times daily.
- Patient replies (e.g. "DONE" or "1") are received via a Twilio webhook and logged automatically.
- A risk engine recalculates each patient's status (Green / Yellow / Red) based on adherence history and missed doses — no manual review required.
- Missed doses or severe symptoms automatically generate an **escalation** for the health worker to act on.

### 2. AI Q&A Assistant
- Patients can text questions about their treatment (diet, side effects, general TB education).
- Powered by Google's Gemini API, with a TB knowledge base for context.
- Strict guardrails ensure the AI never diagnoses, prescribes, or advises stopping/changing medication — these queries are refused and redirected to the patient's health worker.

### 3. Health Worker Dashboard
- A web dashboard shows a prioritized patient list based on risk level.
- Includes patient detail views (adherence history, compliance matrix), an open escalation queue, and reporting.
- Built for quick scanning on tablets in clinical settings.

## How This Meets the Internship Requirement

| Requirement | Implementation |
|---|---|
| Automated workflow | Cron-based reminder engine + Twilio webhook-driven adherence logging |
| AI model integration | Gemini LLM for patient Q&A with retrieval-augmented context |
| API integration | Twilio (WhatsApp/SMS), Gemini API |
| Decision-making / decision support | Automated risk classification (Green/Yellow/Red) and escalation generation |

## Tech Stack

**Frontend:** React 18, Vite, Tailwind CSS, TanStack Query, Zustand, Recharts
**Backend:** Node.js, Express, PostgreSQL, Drizzle ORM, node-cron
**Integrations:** Twilio (WhatsApp/SMS), Google Gemini API (with optional OpenAI fallback)
**Auth:** JWT-based authentication, TOTP-based 2FA for admin accounts

## Project Structure

```
nikshay-saathi/
├── server.ts                 # Express entrypoint — mounts all routes, cron jobs, Vite middleware
├── src/
│   ├── routes/                # API route handlers (auth, patients, webhooks, admin, etc.)
│   ├── services/               # Cron jobs, risk engine, reminder engine, backups
│   ├── middleware/             # Auth middleware
│   ├── utils/                  # Crypto, logging, Twilio client, secrets handling
│   ├── db/                     # Drizzle schema, DB connection, migrations config
│   ├── components/             # React UI components
│   └── pages/                  # React pages (dashboard, patients, simulator, etc.)
```

## Key Features

- **Automated daily reminders** — no manual intervention required once a patient is enrolled
- **Risk-based prioritization** — health workers see who needs attention first, not a flat list
- **AI-guarded Q&A** — patients get real answers without risk of unsafe medical advice
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
- `GEMINI_API_KEY` — optional; powers the AI Q&A assistant
- `APP_URL` — must match your public URL exactly if testing inbound Twilio webhooks (e.g. via [ngrok](https://ngrok.com) for local development), since it's used for Twilio signature verification

## Disclaimer

This software is an adherence analytics and outreach tool. It does not provide medical diagnosis, treatment, or prescriptions. For any medical concern, patients are directed to contact their assigned health worker or public health center.

## Acknowledgements

Built as part of the **IBM SkillsBuild Academic Internship** in partnership with **AICTE** and **CSRBOX**, under the AI Automation & Intelligent Solutions track.
