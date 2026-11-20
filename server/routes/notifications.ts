import { Router } from 'express';
import { NotificationModel } from '../db.ts';
import { registerNotificationStream, serializeNotification } from '../notifications.ts';
import {
  AppError,
  ensureDbReady,
  extractTokenFromRequest,
  requireAuth,
  verifyTokenAndLoadUser,
} from '../security.ts';
import { requireObjectId } from '../validation.ts';

const router = Router();

// SSE stream supports query token (for EventSource) or Authorization/cookie
router.get('/stream', async (req, res, next) => {
  try {
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const token = queryToken || extractTokenFromRequest(req);
    if (!token) {
      next(new AppError('Authentication required. Please sign in.', 401, 'UNAUTHORIZED'));
      return;
    }

    await ensureDbReady();
    const user = await verifyTokenAndLoadUser(token);
    if (!user) {
      next(
        new AppError(
          'Your session has expired or is invalid. Please sign in again.',
          401,
          'SESSION_EXPIRED'
        )
      );
      return;
    }

    registerNotificationStream(req, res);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const [docs, unreadCount] = await Promise.all([
      NotificationModel.find().sort({ createdAt: -1 }).limit(30).lean(),
      NotificationModel.countDocuments({ read: false }),
    ]);

    res.json({
      notifications: docs.map((d) =>
        serializeNotification(d as unknown as Parameters<typeof serializeNotification>[0])
      ),
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Notification ID');
    const updated = await NotificationModel.findByIdAndUpdate(
      id,
      { $set: { read: true } },
      { new: true }
    ).lean();

    if (!updated) {
      throw new AppError('Notification not found.', 404, 'NOT_FOUND');
    }

    const unreadCount = await NotificationModel.countDocuments({ read: false });
    res.json({
      notification: serializeNotification(
        updated as unknown as Parameters<typeof serializeNotification>[0]
      ),
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (_req, res, next) => {
  try {
    await NotificationModel.updateMany({ read: false }, { $set: { read: true } });
    res.json({ success: true, unreadCount: 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
