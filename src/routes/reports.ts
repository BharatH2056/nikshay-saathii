import { Router } from 'express';
import { db } from '@/src/db';
import { adherenceLogs, patients } from '@/src/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { decrypt, decryptPatient } from '../utils/crypto';

const router = Router();

// GET /v1/reports/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/summary', authMiddleware, async (req: AuthRequest, res) => {
  const { start, end } = req.query;

  try {
    const allPatients = await db.select().from(patients);

    let conditions: any[] = [];
    if (start) conditions.push(gte(adherenceLogs.logDate, start as string));
    if (end) conditions.push(lte(adherenceLogs.logDate, end as string));

    const logs = await db.select({
      patientId: adherenceLogs.patientId,
      status: adherenceLogs.status,
      logDate: adherenceLogs.logDate,
    })
      .from(adherenceLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalLogs = logs.length;
    const dosesTaken = logs.filter(l => l.status).length;
    const dosessMissed = totalLogs - dosesTaken;
    const overallAdherenceRate = totalLogs > 0 ? Math.round((dosesTaken / totalLogs) * 100) : 0;

    // Per-patient breakdown
    const patientBreakdown = allPatients.map(p => {
      const decryptedP = decryptPatient(p);
      const pLogs = logs.filter(l => l.patientId === decryptedP.id);
      const taken = pLogs.filter(l => l.status).length;
      const missed = pLogs.length - taken;
      const rate = pLogs.length > 0 ? Math.round((taken / pLogs.length) * 100) : 0;
      return {
        patientId: decryptedP.id,
        fullName: decryptedP.fullName,
        phone: decryptedP.phone,
        riskLevel: decryptedP.riskLevel,
        taken,
        missed,
        rate,
      };
    });

    res.json({
      totalPatients: allPatients.length,
      totalLogs,
      dosesTaken,
      dosessMissed,
      overallAdherenceRate,
      patientBreakdown,
    });
  } catch (error) {
    console.error('Reports summary error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// GET /v1/reports/csv?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/csv', authMiddleware, async (req: AuthRequest, res) => {
  const { start, end } = req.query;

  try {
    let conditions: any[] = [];
    if (start) conditions.push(gte(adherenceLogs.logDate, start as string));
    if (end) conditions.push(lte(adherenceLogs.logDate, end as string));

    const records = await db.select({
      patientName: patients.fullName,
      phone: patients.phone,
      date: adherenceLogs.logDate,
      status: adherenceLogs.status,
      responseText: adherenceLogs.responseText,
    })
      .from(adherenceLogs)
      .innerJoin(patients, eq(adherenceLogs.patientId, patients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(adherenceLogs.logDate);

    let csv = 'patient_name,phone,date,status,response_text\n';
    for (const r of records) {
      const statusStr = r.status ? 'taken' : 'missed';
      const decryptedName = decrypt(r.patientName);
      const decryptedPhone = decrypt(r.phone);
      const nameEscaped = `"${decryptedName.replace(/"/g, '""')}"`;
      csv += `${nameEscaped},${decryptedPhone},${r.date},${statusStr},"${(r.responseText || '').replace(/"/g, '""')}"\n`;
    }

    res.header('Content-Type', 'text/csv');
    res.attachment(`nikshay-report-${start || 'all'}-${end || 'all'}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV reports' });
  }
});

// Legacy endpoint alias
router.get('/adherence-csv', authMiddleware, async (req: AuthRequest, res) => {
  res.redirect(`/v1/reports/csv?${new URLSearchParams(req.query as Record<string, string>).toString()}`);
});

export default router;
