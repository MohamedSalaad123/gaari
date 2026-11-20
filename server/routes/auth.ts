import { Router } from 'express';
import { connectToDatabase, getDbStatus, isDbConnected, UserModel } from '../db.ts';
import {
  AppError,
  checkLoginRateLimit,
  clearAuthCookie,
  clearFailedLoginAttempts,
  ensureDbReady,
  extractTokenFromRequest,
  getClientAttemptKey,
  hashPassword,
  recordFailedLoginAttempt,
  requireAuth,
  setAuthCookie,
  signAuthToken,
  validatePasswordStrength,
  verifyPassword,
  verifyTokenAndLoadUser,
  type AuthenticatedRequest,
} from '../security.ts';
import { requireNonEmptyString } from '../validation.ts';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    let status = getDbStatus();
    if (status.configured && !status.connected) {
      await connectToDatabase();
      status = getDbStatus();
    }

    if (!isDbConnected()) {
      res.json({
        needsSetup: false,
        authenticated: false,
        user: null,
        dbConfigured: status.configured,
        dbConnected: false,
        dbError: status.error,
      });
      return;
    }

    const userCount = await UserModel.countDocuments();
    const needsSetup = userCount === 0;

    if (needsSetup) {
      res.json({
        needsSetup: true,
        authenticated: false,
        user: null,
        dbConfigured: true,
        dbConnected: true,
        dbError: null,
      });
      return;
    }

    const token = extractTokenFromRequest(req);
    const user = token ? await verifyTokenAndLoadUser(token) : null;

    res.json({
      needsSetup: false,
      authenticated: Boolean(user),
      user,
      dbConfigured: true,
      dbConnected: true,
      dbError: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/setup', async (req, res, next) => {
  try {
    await ensureDbReady();

    const userCount = await UserModel.countDocuments();
    if (userCount > 0) {
      throw new AppError(
        'Administrator account already exists. Public registration is disabled.',
        403,
        'SETUP_ALREADY_COMPLETED'
      );
    }

    const username = requireNonEmptyString(req.body?.username, 'Username', 50);
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
      throw new AppError(
        'Username must be 3 to 50 characters using letters, numbers, dots, underscores, or hyphens.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const fullName = requireNonEmptyString(req.body?.fullName || 'Administrator', 'Full Name', 100);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      throw new AppError(strengthError, 400, 'WEAK_PASSWORD');
    }

    if (password !== confirmPassword) {
      throw new AppError('Password confirmation does not match.', 400, 'PASSWORD_MISMATCH');
    }

    const passwordHash = await hashPassword(password);

    // Double-check right before insert to prevent concurrent admin creation
    const recheckCount = await UserModel.countDocuments();
    if (recheckCount > 0) {
      throw new AppError(
        'Administrator account already exists. Public registration is disabled.',
        403,
        'SETUP_ALREADY_COMPLETED'
      );
    }

    const created = await UserModel.create({
      username,
      usernameLower: username.toLowerCase(),
      fullName,
      passwordHash,
      role: 'admin',
      tokenVersion: 1,
    });

    res.status(201).json({
      setupComplete: true,
      authenticated: false,
      username: created.username,
      message: 'Administrator account created successfully. Please sign in.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    await ensureDbReady();

    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      throw new AppError('System setup is required before signing in.', 400, 'SETUP_REQUIRED');
    }

    const username = requireNonEmptyString(req.body?.username, 'Username', 50);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      throw new AppError('Password is required.', 400, 'VALIDATION_ERROR');
    }

    const attemptKey = getClientAttemptKey(req, username);
    const rateCheck = await checkLoginRateLimit(attemptKey);
    if (rateCheck.blocked) {
      const mins = Math.ceil(rateCheck.remainingSeconds / 60);
      throw new AppError(
        `Too many failed login attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
        429,
        'RATE_LIMITED'
      );
    }

    const userDoc = await UserModel.findOne({ usernameLower: username.toLowerCase() });
    const validPassword = userDoc ? await verifyPassword(password, userDoc.passwordHash) : false;

    if (!userDoc || !validPassword) {
      const attemptState = await recordFailedLoginAttempt(attemptKey);
      if (attemptState.locked) {
        throw new AppError(
          'Account temporarily locked due to 5 failed login attempts. Please wait 15 minutes.',
          429,
          'RATE_LIMITED'
        );
      }
      throw new AppError(
        `Invalid username or password. ${attemptState.remainingAttempts} attempt${
          attemptState.remainingAttempts === 1 ? '' : 's'
        } remaining before lockout.`,
        401,
        'INVALID_CREDENTIALS'
      );
    }

    await clearFailedLoginAttempts(attemptKey);

    const authUser = {
      id: userDoc._id.toString(),
      username: userDoc.username,
      fullName: userDoc.fullName,
      role: userDoc.role,
      tokenVersion: userDoc.tokenVersion ?? 1,
    };

    const token = signAuthToken(authUser);
    setAuthCookie(res, token);

    res.json({
      authenticated: true,
      token,
      user: authUser,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await ensureDbReady();
    const userId = req.user!.id;

    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (!currentPassword) {
      throw new AppError('Current password is required.', 400, 'VALIDATION_ERROR');
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      throw new AppError(strengthError, 400, 'WEAK_PASSWORD');
    }

    if (newPassword !== confirmPassword) {
      throw new AppError('New password confirmation does not match.', 400, 'PASSWORD_MISMATCH');
    }

    if (currentPassword === newPassword) {
      throw new AppError(
        'New password must be different from your current password.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc) {
      throw new AppError('User account not found.', 404, 'NOT_FOUND');
    }

    const matches = await verifyPassword(currentPassword, userDoc.passwordHash);
    if (!matches) {
      throw new AppError('Current password is incorrect.', 401, 'INVALID_CREDENTIALS');
    }

    userDoc.passwordHash = await hashPassword(newPassword);
    userDoc.tokenVersion = (userDoc.tokenVersion ?? 1) + 1;
    await userDoc.save();

    const updatedUser = {
      id: userDoc._id.toString(),
      username: userDoc.username,
      fullName: userDoc.fullName,
      role: userDoc.role,
      tokenVersion: userDoc.tokenVersion,
    };

    const newToken = signAuthToken(updatedUser);
    setAuthCookie(res, newToken);

    res.json({
      success: true,
      token: newToken,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
