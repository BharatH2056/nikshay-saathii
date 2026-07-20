import { Router } from 'express';
import { db } from '@/src/db';
import { reminders } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendDailyReminder, triggerAllActiveReminders } from '../services/reminderEngine';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id, status } = req.query;

  try {
    let conditions = [];
    if (patient_id) {
      conditions.push(eq(reminders.patientId, patient_id as string));
    }
    if (status) {
      conditions.push(eq(reminders.status, status as string));
    }

    const list = await db.select()
      .from(reminders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reminders.scheduledAt));

    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

router.post('/trigger', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id } = req.body;
  if (!patient_id) {
    return res.status(400).json({ error: 'patient_id is required' });
  }

  try {
    const reminder = await sendDailyReminder(patient_id);
    if (!reminder) {
      return res.status(400).json({ error: 'Could not send reminder. Verify patient is active.' });
    }
    res.json({ success: true, reminder });
  } catch (error) {
    console.error('Trigger reminder error:', error);
    res.status(500).json({ error: 'Failed to trigger reminder' });
  }
});

router.post('/custom', authMiddleware, async (req: AuthRequest, res) => {
  const { patient_id, message_content, channel } = req.body;
  if (!patient_id || !message_content || !channel) {
    return res.status(400).json({ error: 'patient_id, message_content, and channel are required' });
  }

  try {
    const [reminder] = await db.insert(reminders).values({
      patientId: patient_id,
      scheduledAt: new Date(),
      sentAt: new Date(),
      channel: channel as any,
      status: 'delivered',
      messageContent: message_content,
      acknowledged: false,
    }).returning();

    res.json({ success: true, reminder });
  } catch (error) {
    console.error('Custom reminder error:', error);
    res.status(500).json({ error: 'Failed to create custom reminder' });
  }
});

router.post('/:id/acknowledge', authMiddleware, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { acknowledged } = req.body;

  try {
    const updated = await db.update(reminders)
      .set({
        acknowledged: acknowledged === true,
        acknowledgedAt: acknowledged === true ? new Date() : null
      })
      .where(eq(reminders.id, id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({ success: true, reminder: updated[0] });
  } catch (error) {
    console.error('Acknowledge reminder error:', error);
    res.status(500).json({ error: 'Failed to update reminder acknowledgment' });
  }
});

router.post('/trigger-all', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Manually trigger a broadcast to all active patients
    await triggerAllActiveReminders('Manual-Test');
    res.json({ success: true, message: 'Broadcast triggered for all active patients' });
  } catch (error) {
    console.error('Trigger all reminders error:', error);
    res.status(500).json({ error: 'Failed to trigger all reminders' });
  }
});

export default router;
