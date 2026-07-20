import { Router } from 'express';
import { db } from '@/src/db';
import { patients, adherenceLogs, escalations } from '@/src/db/schema';
import { eq, desc, gte } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { subDays, format } from 'date-fns';
import { calculateMedicationDaysRemaining } from '../utils/patient';

const router = Router();

// GET /v1/dashboard — Combined dashboard data (stats + priority queue + 7-day trend)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));

    const lowMedicationPatients = activePatients
      .map(p => {
        const remaining = calculateMedicationDaysRemaining(p.treatmentStart, p.lastRefillDate, p.medicationSupplyDays);
        return {
          ...p,
          medicationDaysRemaining: remaining
        };
      })
      .filter(p => p.medicationDaysRemaining <= 5);

    const stats = {
      total: activePatients.length,
      red: activePatients.filter(p => p.riskLevel === 'red').length,
      yellow: activePatients.filter(p => p.riskLevel === 'yellow').length,
      green: activePatients.filter(p => p.riskLevel === 'green').length,
      lowMedicationCount: lowMedicationPatients.length,
    };

    // Priority queue: red first, yellow second (skip green unless all green)
    const priorityPatients = [...activePatients]
      .map(p => {
        const remaining = calculateMedicationDaysRemaining(p.treatmentStart, p.lastRefillDate, p.medicationSupplyDays);
        return {
          ...p,
          medicationDaysRemaining: remaining
        };
      })
      .sort((a, b) => {
        const priority = { red: 3, yellow: 2, green: 1 };
        const ap = priority[a.riskLevel as 'red' | 'yellow' | 'green'] ?? 1;
        const bp = priority[b.riskLevel as 'red' | 'yellow' | 'green'] ?? 1;
        if (ap !== bp) return bp - ap;
        return a.currentStreak - b.currentStreak;
      })
      .slice(0, 10);

    // 7-day adherence trend
    const today = new Date();
    const sevenDaysAgo = format(subDays(today, 6), 'yyyy-MM-dd');
    const recentLogs = await db.select()
      .from(adherenceLogs)
      .where(gte(adherenceLogs.logDate, sevenDaysAgo));

    const adherenceTrend = Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(today, 6 - i), 'yyyy-MM-dd');
      const dayLogs = recentLogs.filter(l => l.logDate === date);
      const taken = dayLogs.filter(l => l.status).length;
      const total = dayLogs.length;
      return {
        date,
        rate: total > 0 ? Math.round((taken / total) * 100) : null,
        taken,
        total,
      };
    });

    res.json({ stats, priorityPatients, adherenceTrend, lowMedicationPatients });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Legacy routes kept for backwards compatibility
router.get('/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));
    const logs = await db.select().from(adherenceLogs);
    const taken = logs.filter(l => l.status).length;
    const totalLogs = logs.length;
    res.json({
      total: activePatients.length,
      red: activePatients.filter(p => p.riskLevel === 'red').length,
      yellow: activePatients.filter(p => p.riskLevel === 'yellow').length,
      green: activePatients.filter(p => p.riskLevel === 'green').length,
      avgAdherence: totalLogs > 0 ? (taken / totalLogs) * 100 : 100
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

router.get('/prioritized', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const activePatients = await db.select().from(patients).where(eq(patients.status, 'active'));
    res.json({
      red: activePatients.filter(p => p.riskLevel === 'red').sort((a, b) => a.currentStreak - b.currentStreak),
      yellow: activePatients.filter(p => p.riskLevel === 'yellow').sort((a, b) => a.currentStreak - b.currentStreak),
      green: activePatients.filter(p => p.riskLevel === 'green').sort((a, b) => b.currentStreak - a.currentStreak),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prioritized patient lists' });
  }
});

export default router;
