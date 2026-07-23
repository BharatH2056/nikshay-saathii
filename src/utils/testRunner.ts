import { db, seedDatabase } from '../db';
import { patients, adherenceLogs, escalations } from '../db/schema';
import { computeRisk } from '../services/riskClassifier';
import { checkAndAutoResolve } from '../services/escalationEngine';
import { runHermesVerificationSuite } from './hermesVerificationTest';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

export async function runEngineTests(): Promise<{ success: boolean; results: TestResult[] }> {
  const results: TestResult[] = [];
  
  // 1. Create a mock health worker and patient for testing
  const testPatientId = `test-pat-${crypto.randomUUID()}`;
  const testHwId = '11111111-1111-1111-1111-111111111111'; // Anjali CHW

  try {
    // Insert test patient
    await db.insert(patients).values({
      id: testPatientId,
      fullName: 'Test Patient (Temporary)',
      phone: `test-phone-${crypto.randomUUID()}`,
      language: 'en',
      condition: 'TB',
      regimenType: 'standard_6mo_dots',
      treatmentStart: '2026-01-01',
      treatmentDurationDays: 180,
      status: 'active',
      healthWorkerId: testHwId,
      riskLevel: 'green',
      currentStreak: 0,
      channelPref: 'whatsapp',
    });

    const today = new Date();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Green Patient with high adherence (no missed doses in last 7 days)
    // ─────────────────────────────────────────────────────────────────────────
    const logsTest1 = [];
    for (let i = 0; i < 7; i++) {
      const logDate = new Date();
      logDate.setDate(today.getDate() - i);
      logsTest1.push({
        id: `test-log-${crypto.randomUUID()}`,
        patientId: testPatientId,
        logDate: logDate.toISOString().split('T')[0],
        status: true, // Taken
      });
    }
    await db.insert(adherenceLogs).values(logsTest1);

    // Compute risk
    const res1 = await computeRisk(testPatientId);
    
    results.push({
      name: 'Risk Classifier: Green Patient with high adherence (100% adherence)',
      passed: res1.riskLevel === 'green' && res1.currentStreak === 7,
      expected: 'riskLevel = green, currentStreak = 7',
      actual: `riskLevel = ${res1.riskLevel}, currentStreak = ${res1.currentStreak}`,
    });

    // Clean up adherence logs for next test
    await db.delete(adherenceLogs).where(eq(adherenceLogs.patientId, testPatientId));

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Red Patient with 2 consecutive missed doses
    // ─────────────────────────────────────────────────────────────────────────
    const logsTest2 = [];
    // Day 0: Missed, Day 1: Missed, Day 2-6: Taken
    for (let i = 0; i < 7; i++) {
      const logDate = new Date();
      logDate.setDate(today.getDate() - i);
      logsTest2.push({
        id: `test-log-${crypto.randomUUID()}`,
        patientId: testPatientId,
        logDate: logDate.toISOString().split('T')[0],
        status: i >= 2, // Missed for day 0 and day 1
      });
    }
    await db.insert(adherenceLogs).values(logsTest2);

    // Compute risk (consecutiveMissed should be 2, riskLevel should drop to red)
    const res2 = await computeRisk(testPatientId);

    // Verify if open escalation was automatically created
    const openEscs = await db.select()
      .from(escalations)
      .where(and(
        eq(escalations.patientId, testPatientId),
        eq(escalations.status, 'open')
      ));

    results.push({
      name: 'Risk Classifier: Red Patient transition with 2 consecutive missed doses',
      passed: res2.riskLevel === 'red' && openEscs.length === 1,
      expected: 'riskLevel = red, open escalations count = 1',
      actual: `riskLevel = ${res2.riskLevel}, open escalations count = ${openEscs.length}`,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Escalation Engine: Auto-resolve with 3 consecutive taken doses
    // ─────────────────────────────────────────────────────────────────────────
    // Clean logs
    await db.delete(adherenceLogs).where(eq(adherenceLogs.patientId, testPatientId));

    const logsTest3 = [];
    // Add 3 consecutive taken doses
    for (let i = 0; i < 3; i++) {
      const logDate = new Date();
      logDate.setDate(today.getDate() - i);
      logsTest3.push({
        id: `test-log-${crypto.randomUUID()}`,
        patientId: testPatientId,
        logDate: logDate.toISOString().split('T')[0],
        status: true, // Taken
      });
    }
    await db.insert(adherenceLogs).values(logsTest3);

    // Run escalation engine auto resolution check
    await checkAndAutoResolve(testPatientId);

    // Fetch escalation status
    const escs = await db.select()
      .from(escalations)
      .where(eq(escalations.patientId, testPatientId));

    const resolvedEscs = escs.filter(e => e.status === 'auto_resolved');

    results.push({
      name: 'Escalation Engine: Auto-resolution after 3 consecutive taken doses',
      passed: resolvedEscs.length === 1,
      expected: 'escalation status = auto_resolved',
      actual: `resolved escalations count = ${resolvedEscs.length} out of ${escs.length}`,
    });

  } catch (error: any) {
    results.push({
      name: 'Integration Test Execution Suite',
      passed: false,
      expected: 'All tests execute and pass',
      actual: 'Crash or SQL execution error',
      error: error.message || String(error),
    });
  } finally {
    // ─────────────────────────────────────────────────────────────────────────
    // CLEANUP Phase: Self-healing data deletion
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await db.delete(adherenceLogs).where(eq(adherenceLogs.patientId, testPatientId));
      await db.delete(escalations).where(eq(escalations.patientId, testPatientId));
      await db.delete(patients).where(eq(patients.id, testPatientId));
    } catch (cleanupErr) {
      console.error('Test cleanup failed:', cleanupErr);
    }
  }

  const success = results.every(r => r.passed);
  return { success, results };
}

// Self-run hook for CLI & CI Pipeline integration
if (process.argv[1] && (process.argv[1].endsWith('testRunner.ts') || process.argv[1].endsWith('testRunner.js'))) {
  (async () => {
    let overallSuccess = true;

    console.log('[TEST RUNNER] Seeding database with demo data...');
    await seedDatabase();

    // ── Suite 1: Engine Tests (risk classifier / escalation) ─────────────────
    console.log('[TEST RUNNER] Suite 1: Engine & Integration Tests...');
    const engineRes = await runEngineTests().catch(err => {
      console.error('[TEST RUNNER FATAL] Engine suite crashed:', err);
      overallSuccess = false;
      return { success: false, results: [] };
    });

    console.log(`\n[TEST RUNNER] Engine suite: Passed ${engineRes.results.filter(r => r.passed).length} of ${engineRes.results.length}`);
    engineRes.results.forEach(r => {
      console.log(` ${r.passed ? '✅' : '❌'} ${r.name}`);
      if (!r.passed) {
        console.log(`    -> Expected: ${r.expected}`);
        console.log(`    -> Actual:   ${r.actual}`);
        if (r.error) console.log(`    -> Error:    ${r.error}`);
      }
    });
    if (!engineRes.success) overallSuccess = false;

    // ── Suite 2: Hermes Integration Verification ──────────────────────────────
    console.log('\n[TEST RUNNER] Suite 2: Hermes Two-Track Integration Verification...');
    await runHermesVerificationSuite().catch(err => {
      // runHermesVerificationSuite already prints per-test [PASS]/[FAIL] lines.
      // It throws on any failures, which we catch here to unify exit handling.
      console.error('[TEST RUNNER] Hermes verification suite failed:', err.message);
      overallSuccess = false;
    });

    console.log(`\n[TEST RUNNER] All suites complete. Overall: ${overallSuccess ? 'PASSED ✅' : 'FAILED ❌'}`);
    process.exit(overallSuccess ? 0 : 1);
  })();
}
