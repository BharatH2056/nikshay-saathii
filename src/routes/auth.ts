import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '@/src/db';
import { healthWorkers } from '@/src/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { getSecret } from '../utils/secrets';
import { logAudit } from '../utils/audit';
import { generateBase32Secret, verifyTOTP } from '../utils/totp';
import { sendTwilioMessage } from '../utils/twilio';

const router = Router();
const JWT_SECRET = getSecret('JWT_SECRET', 'nikshay_saathi_capstone_jwt_secret_64_character_long_key_development_only', true);

const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per email per 15 minutes
  keyGenerator: (req) => {
    return req.body && req.body.email ? String(req.body.email).toLowerCase().trim() : req.ip || '';
  },
  message: { error: 'Too many login attempts for this email, please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

const verify2FaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per userId per 15 minutes
  keyGenerator: (req) => {
    return req.body && req.body.userId ? String(req.body.userId).trim() : req.ip || '';
  },
  message: { error: 'Too many 2FA verification attempts for this account, please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

router.post('/login', loginEmailLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.select().from(healthWorkers).where(eq(healthWorkers.email, email)).limit(1);
    if (user.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hw = user[0];
    const passwordMatch = await bcrypt.compare(password, hw.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if 2FA is required (admin-only security feature)
    if (hw.role === 'admin' && hw.twoFactorEnabled) {
      return res.json({
        twoFactorRequired: true,
        userId: hw.id,
        message: 'Two-factor authentication code is required'
      });
    }

    const token = jwt.sign(
      { id: hw.id, email: hw.email, role: hw.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Audit log successful authentication
    await logAudit(
      { id: hw.id, email: hw.email },
      'USER_LOGIN',
      null,
      null,
      `User logged in successfully with role: ${hw.role}`
    );

    res.json({
      token,
      user: {
        id: hw.id,
        fullName: hw.fullName,
        email: hw.email,
        phone: hw.phone,
        role: hw.role,
        region: hw.region,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await db.select().from(healthWorkers).where(eq(healthWorkers.id, req.user.id)).limit(1);
    if (user.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists in database' });
    }
    const hw = user[0];
    res.json({
      user: {
        id: hw.id,
        fullName: hw.fullName,
        email: hw.email,
        phone: hw.phone,
        role: hw.role,
        region: hw.region,
      }
    });
  } catch (error) {
    console.error('Fetch /me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/auth/workers - Fetch list of active health workers (for assignments)
router.get('/workers', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const workers = await db.select().from(healthWorkers);
    const sanitized = workers.map(w => ({
      id: w.id,
      fullName: w.fullName,
      region: w.region,
    }));
    res.json(sanitized);
  } catch (error) {
    console.error('Fetch workers for assignment error:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// ── TWO-FACTOR AUTHENTICATION (2FA) ENDPOINTS ──────────────────────────────

// POST /v1/auth/verify-2fa - Submit code to complete 2FA login for admin
router.post('/verify-2fa', verify2FaLimiter, async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'User ID and 2FA code are required' });
  }

  try {
    const user = await db.select().from(healthWorkers).where(eq(healthWorkers.id, userId)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hw = user[0];
    if (!hw.twoFactorEnabled || !hw.twoFactorSecret) {
      return res.status(400).json({ error: 'Two-factor authentication is not enabled for this user' });
    }

    const isValid = verifyTOTP(hw.twoFactorSecret, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid two-factor authentication code' });
    }

    const token = jwt.sign(
      { id: hw.id, email: hw.email, role: hw.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await logAudit(
      { id: hw.id, email: hw.email },
      'USER_LOGIN',
      null,
      null,
      `User logged in successfully with 2FA verification. Role: ${hw.role}`
    );

    res.json({
      token,
      user: {
        id: hw.id,
        fullName: hw.fullName,
        email: hw.email,
        phone: hw.phone,
        role: hw.role,
        region: hw.region,
      }
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/auth/setup-2fa - Generate temporary TOTP secret key for setup (Admin only)
router.post('/setup-2fa', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: 2FA setup is restricted to Administrators' });
  }

  try {
    const secret = generateBase32Secret();
    const qrCodeUrl = `otpauth://totp/NikshaySaathi:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=NikshaySaathi`;
    
    res.json({
      success: true,
      secret,
      qrCodeUrl,
      message: 'TOTP secret generated successfully. Please scan this into your authenticator app.'
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to initialize 2FA' });
  }
});

// POST /v1/auth/enable-2fa - Confirm code and enable 2FA permanently (Admin only)
router.post('/enable-2fa', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { secret, code } = req.body;
  if (!secret || !code) {
    return res.status(400).json({ error: 'Secret and verification code are required' });
  }

  try {
    const isValid = verifyTOTP(secret, code);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
    }

    await db.update(healthWorkers).set({
      twoFactorSecret: secret,
      twoFactorEnabled: true,
    }).where(eq(healthWorkers.id, req.user.id));

    await logAudit(
      req.user,
      'USER_EDIT',
      'twoFactorEnabled',
      'true',
      'Two-factor authentication enabled successfully.'
    );

    res.json({
      success: true,
      message: 'Two-factor authentication has been successfully enabled on your account.'
    });
  } catch (error) {
    console.error('2FA activation error:', error);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// POST /v1/auth/disable-2fa - Confirm current 2FA code and disable 2FA
router.post('/disable-2fa', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Verification code is required to disable 2FA' });
  }

  try {
    const user = await db.select().from(healthWorkers).where(eq(healthWorkers.id, req.user.id)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hw = user[0];
    if (!hw.twoFactorEnabled || !hw.twoFactorSecret) {
      return res.status(400).json({ error: '2FA is already disabled' });
    }

    const isValid = verifyTOTP(hw.twoFactorSecret, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    await db.update(healthWorkers).set({
      twoFactorSecret: null,
      twoFactorEnabled: false,
    }).where(eq(healthWorkers.id, req.user.id));

    await logAudit(
      req.user,
      'USER_EDIT',
      'twoFactorEnabled',
      'false',
      'Two-factor authentication disabled successfully.'
    );

    res.json({
      success: true,
      message: 'Two-factor authentication has been disabled successfully.'
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// ── PASSWORD RESET FLOW ENDPOINTS ───────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /v1/auth/forgot-password - Generate password reset token and send via Twilio/SMS
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  try {
    const user = await db.select().from(healthWorkers).where(eq(healthWorkers.email, email)).limit(1);
    
    // Safety check against email harvesting: return generic success even if user not found
    if (user.length === 0) {
      return res.json({
        success: true,
        message: 'If the email matches an active account, password reset instructions will be sent.'
      });
    }

    const hw = user[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = hashToken(rawToken);
    const expires = new Date(Date.now() + 3600 * 1000); // 1 hour token expiration

    await db.update(healthWorkers).set({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: expires
    }).where(eq(healthWorkers.id, hw.id));

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    console.log(`[PASSWORD RESET] Secure password reset token and URL generated for ${hw.email}. Link dispatched via SMS.`);

    // Send notification to the user's phone via Twilio SMS fallback integration
    const resetMsg = `Nikshay Saathi Password Reset: Use this link to complete your password reset: ${resetUrl} (Valid for 1 hour)`;
    try {
      await sendTwilioMessage({
        phone: hw.phone,
        fullName: hw.fullName,
        channelPref: 'sms'
      }, resetMsg);
      console.log(`[PASSWORD RESET SMS] Successfully dispatched SMS link to registered phone: ${hw.phone.slice(0, 5)}******`);
    } catch (smsErr: any) {
      console.error('[PASSWORD RESET SMS FAIL] Failed to dispatch Twilio SMS notification:', smsErr.message);
    }

    res.json({
      success: true,
      message: 'Password reset instructions have been dispatched successfully.'
    });
  } catch (error) {
    console.error('Forgot password handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/auth/reset-password - Process password reset using token
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }

  try {
    const hashedToken = hashToken(token);
    // Find active unexpired token
    const user = await db.select()
      .from(healthWorkers)
      .where(and(
        eq(healthWorkers.resetPasswordToken, hashedToken),
        gt(healthWorkers.resetPasswordExpires, new Date())
      ))
      .limit(1);

    if (user.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const hw = user[0];
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Clear reset tokens and save new hash
    await db.update(healthWorkers).set({
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null
    }).where(eq(healthWorkers.id, hw.id));

    await logAudit(
      { id: hw.id, email: hw.email },
      'PASSWORD_RESET',
      null,
      null,
      'User reset password successfully via secure reset token.'
    );

    res.json({
      success: true,
      message: 'Your password has been reset successfully. You may now log in.'
    });
  } catch (error) {
    console.error('Reset password handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
