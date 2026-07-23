# Track 1 — Hermes Agent for Internal Ops (Architecture & Isolation Guide)

## Overview

Hermes Agent ([NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)) is a self-hosted, self-improving autonomous background gateway service. Because it possesses broad autonomy, automatic tool calling, scheduled cron execution, and connections to multiple messaging platforms, **it must be strictly isolated from all patient data, database instances, and patient-facing communication systems.**

In compliance with the **Digital Personal Data Protection (DPDP) Act** and medical privacy standards, Hermes Agent operates exclusively on **Track 1 (Internal Ops)**.

---

## Data & Network Isolation Rules

1. **Zero Access to Patient Database**: Hermes Agent must be deployed on an isolated host, virtual private server (VPS), or container with **no network route** to `SQL_HOST`, `SQL_DB_NAME`, or PostgreSQL port `5432`.
2. **Zero Access to Encryption Secrets**: Hermes Agent must **never** be provided the application `ENCRYPTION_KEY` or `JWT_SECRET`.
3. **Zero Access to Patient Twilio Credentials**: Hermes Agent must not have access to production `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, or `TWILIO_PHONE_NUMBER`.
4. **Independent Deployment**: Run Hermes Agent in its own isolated environment (e.g. Docker container or dedicated VPS) using least-privilege credentials.

```
+-------------------------------------------------------------------+
|               TRACK 1: HERMES AGENT (Ops VPS)                      |
|                                                                   |
|  - GitHub CI/PR Monitoring   - Dependency Vulnerability Alerts     |
|  - Server Health Status      - DB Backup Job Status (Success/Fail)|
|  - Release Note Drafting     - Admin Telegram/Slack Alerts        |
+-------------------------------------------------------------------+
                               | NO NETWORK PATH /
                               | NO DATABASE CREDS
                               v
+-------------------------------------------------------------------+
|            TRACK 2: NIKSHAY SAATHI APP (Patient/Clinical)         |
|                                                                   |
|  - PostgreSQL Database (AES-256-GCM Encrypted Patient PII)        |
|  - Production Twilio Webhooks & Daily Reminders                   |
|  - Express App + Hermes 4 Model Harness (Doctor-Gated)            |
+-------------------------------------------------------------------+
```

---

## Approved Ops Scope for Track 1

Hermes Agent is scoped strictly to the following tasks:

- **Repository Monitoring**: Watching `https://github.com/BharatH2056/nikshay-saathii` for CI build failures, test run status, open pull requests, and new issues.
- **Server Infrastructure Health**: Monitoring system disk space, memory usage, CPU load, and server uptime.
- **Backup Verification**: Monitoring database backup cron job completion logs (status reporting only: `SUCCESS` / `FAILED` — **no access to backup SQL dump content**).
- **Dependency Update Notifications**: Scanning `package.json` / `bun.lock` for outdated packages or security advisories.
- **Release Note Drafting**: Generating draft changelogs from git commit history between release tags.
- **Admin Ops Notifications**: Reporting infrastructure status to the administrator's private Telegram, Slack, or WhatsApp channel.

---

## Setup & Installation Instructions

### 1. Deployment Environment Setup
Provision a separate VM/container (e.g., Docker container with isolated bridge network).

### 2. Installation
Follow the official Hermes Agent getting started guide:
```bash
# Clone and install Hermes Agent on isolated host
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
pip install -e .
```

### 3. Environment Configuration (`.env.hermes-agent`)
Create an isolated environment file containing ONLY ops-related credentials:

```env
# Track 1 Ops Configuration - NO PATIENT DATA OR PROD DB SECRETS
GITHUB_TOKEN=ghp_ops_readonly_token_here
ADMIN_TELEGRAM_BOT_TOKEN=123456:ABC-DEF_ops_bot_token
ADMIN_TELEGRAM_CHAT_ID=987654321

# DO NOT INCLUDE: SQL_HOST, SQL_PASSWORD, ENCRYPTION_KEY, TWILIO_AUTH_TOKEN
```

### 4. Verification Check
Run the network and environment isolation verification script:
```bash
# Verify no patient database route or PII keys are set
python -c "import os; assert 'SQL_HOST' not in os.environ and 'ENCRYPTION_KEY' not in os.environ, 'SECURITY VIOLATION: Patient credentials detected on Track 1 host!'"
```
