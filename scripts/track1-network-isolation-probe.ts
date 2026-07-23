#!/usr/bin/env ts-node
/**
 * TRACK 1 NETWORK ISOLATION PROBE
 * ================================
 * This script MUST be executed INSIDE Track 1's container/VPS to have any
 * meaning. Running it from the main application server will give false results
 * because the main app is supposed to have network access to the DB and Twilio.
 *
 * How to run:
 *   # SSH into Track 1 container, then:
 *   TRACK1_OPS_CONTEXT=true npx ts-node scripts/track1-network-isolation-probe.ts
 *
 * What it tests (using real TCP sockets, not mock objects):
 *   1. Forbidden env vars (SQL_HOST, TWILIO_AUTH_TOKEN, ENCRYPTION_KEY, SQL_PASSWORD)
 *      must NOT be set in Track 1's environment.
 *   2. TCP connection to the production Postgres port (SQL_HOST:5432 or fallback
 *      host from PROD_SQL_HOST) must fail — ECONNREFUSED or ETIMEDOUT.
 *   3. TCP connection to api.twilio.com:443 must fail — Track 1 should have no
 *      egress to Twilio's production API.
 *   4. TCP connection to api.twilio.com:80 must also fail.
 *
 * Exit codes:
 *   0 — all probes confirmed isolation is intact
 *   1 — one or more probes detected a breach or misconfiguration
 *
 * This script is run as a post-deploy step in Track 1's CI/CD pipeline.
 * A non-zero exit blocks promotion to production.
 */

import * as net from 'net';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProbeTarget {
  label: string;
  host: string;
  port: number;
  expectReachable: boolean; // false = must be unreachable (isolation verified)
  timeoutMs?: number;
}

interface ProbeResult {
  label: string;
  reachable: boolean;
  error?: string;
  durationMs: number;
}

// ── Probe Executor ────────────────────────────────────────────────────────────

function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number = 4000
): Promise<{ reachable: boolean; error?: string; durationMs: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ reachable: false, error: 'ETIMEDOUT', durationMs: Date.now() - start });
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ reachable: true, durationMs: Date.now() - start });
    });

    socket.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({
        reachable: false,
        error: err.code || err.message,
        durationMs: Date.now() - start,
      });
    });
  });
}

// ── Env Credential Check ──────────────────────────────────────────────────────

function checkForbiddenEnvVars(): { passed: boolean; found: string[] } {
  const forbidden = ['SQL_HOST', 'TWILIO_AUTH_TOKEN', 'ENCRYPTION_KEY', 'SQL_PASSWORD', 'DATABASE_URL'];
  const found = forbidden.filter((k) => !!process.env[k]);
  return { passed: found.length === 0, found };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     TRACK 1 NETWORK ISOLATION PROBE — Nikshay Saathi        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Guard: must explicitly declare Track 1 context
  if (process.env.TRACK1_OPS_CONTEXT !== 'true') {
    console.error('ERROR: TRACK1_OPS_CONTEXT env var must be set to "true".');
    console.error('This probe only makes sense when run inside Track 1\'s container.');
    console.error('Example: TRACK1_OPS_CONTEXT=true npx ts-node scripts/track1-network-isolation-probe.ts');
    process.exit(1);
  }

  let failures = 0;

  // ── Check 1: Forbidden credentials absent from environment ─────────────────
  console.log('Check 1: Forbidden production credentials absent from environment');
  const envCheck = checkForbiddenEnvVars();
  if (envCheck.passed) {
    console.log('  [PASS] None of SQL_HOST / TWILIO_AUTH_TOKEN / ENCRYPTION_KEY / SQL_PASSWORD are set');
  } else {
    console.error(`  [FAIL] Forbidden env vars present: ${envCheck.found.join(', ')}`);
    console.error('         These credentials must NOT exist in Track 1\'s environment.');
    failures++;
  }

  // ── Resolve production targets from env (or known defaults) ───────────────
  // PROD_SQL_HOST is a read-only hint at the production DB's hostname for probe
  // purposes only — Track 1 must not have DB credentials, but we can store the
  // hostname alone for isolation testing. If not set, skip this probe.
  const prodSqlHost = process.env.PROD_SQL_HOST;
  const prodSqlPort = parseInt(process.env.PROD_SQL_PORT || '5432', 10);

  // ── Define TCP probe targets ───────────────────────────────────────────────
  const targets: ProbeTarget[] = [
    {
      label: 'Twilio API (HTTPS) — api.twilio.com:443',
      host: 'api.twilio.com',
      port: 443,
      expectReachable: false,
      timeoutMs: 4000,
    },
    {
      label: 'Twilio API (HTTP) — api.twilio.com:80',
      host: 'api.twilio.com',
      port: 80,
      expectReachable: false,
      timeoutMs: 4000,
    },
  ];

  if (prodSqlHost) {
    targets.push({
      label: `Production Postgres — ${prodSqlHost}:${prodSqlPort}`,
      host: prodSqlHost,
      port: prodSqlPort,
      expectReachable: false,
      timeoutMs: 4000,
    });
  } else {
    console.log('\n  [INFO] PROD_SQL_HOST not set — skipping Postgres TCP probe.');
    console.log('         Set PROD_SQL_HOST=<db-hostname> (no password needed) to enable this check.');
  }

  // ── Run TCP probes ─────────────────────────────────────────────────────────
  console.log(`\nCheck 2: TCP connection probes (${targets.length} targets)\n`);

  const results: ProbeResult[] = [];

  for (const target of targets) {
    process.stdout.write(`  Probing ${target.label} ... `);
    const { reachable, error, durationMs } = await tcpProbe(target.host, target.port, target.timeoutMs);
    results.push({ label: target.label, reachable, error, durationMs });

    const isolated = !reachable; // we expect unreachable
    const expectedOutcome = target.expectReachable ? 'REACHABLE' : 'UNREACHABLE';
    const actualOutcome = reachable ? 'REACHABLE' : `UNREACHABLE (${error || 'REFUSED'})`;

    if (isolated === !target.expectReachable) {
      // correct result
      const outcome = target.expectReachable ? reachable : !reachable;
      if (outcome) {
        console.log(`[PASS] ${actualOutcome} in ${durationMs}ms ✓`);
      } else {
        // Should not reach here given logic above, but defensive
        console.log(`[PASS] ${actualOutcome} in ${durationMs}ms ✓`);
      }
    } else {
      console.log(`[FAIL] Expected ${expectedOutcome} but got ${actualOutcome} in ${durationMs}ms ✗`);
      if (!target.expectReachable && reachable) {
        console.error(`         ⚠  BREACH: Track 1 can reach ${target.host}:${target.port}`);
        console.error(`            This violates the network isolation contract.`);
        console.error(`            Fix: add an egress firewall/security-group rule blocking`);
        console.error(`            outbound connections to ${target.host} from Track 1's subnet.`);
      }
      failures++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalChecks = 1 + results.length; // env check + TCP probes
  const passed = totalChecks - failures;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  if (failures === 0) {
    console.log(`║  ISOLATION VERIFIED: ${passed}/${totalChecks} checks passed — Track 1 is secure  ║`);
  } else {
    console.log(`║  ISOLATION BREACH DETECTED: ${failures} check(s) FAILED — SEE ABOVE  ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (failures > 0) {
    console.error('Probe failed. Fix the breach(es) above before deploying Track 1 to production.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Probe crashed unexpectedly:', err);
  process.exit(1);
});
