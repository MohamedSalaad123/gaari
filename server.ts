import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { closeDatabase, connectToDatabase, getDbStatus } from './server/db.ts';
import authRoutes from './server/routes/auth.ts';
import backupRoutes from './server/routes/backup.ts';
import dailyWorkRoutes from './server/routes/dailyWorks.ts';
import dashboardRoutes from './server/routes/dashboard.ts';
import expenseRoutes from './server/routes/expenses.ts';
import notificationRoutes from './server/routes/notifications.ts';
import rentalRoutes from './server/routes/rentals.ts';
import reportRoutes from './server/routes/reports.ts';
import vehicleRoutes from './server/routes/vehicles.ts';
import { errorHandler } from './server/security.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function startServer() {
  // Connect to MongoDB Atlas (non-fatal on boot if MONGODB_URI is not yet set so health/status endpoints can explain setup)
  await connectToDatabase();

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigins = parseAllowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition', 'X-Backup-Checksum', 'X-Backup-Total-Records'],
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    let db = getDbStatus();
    if (db.configured && !db.connected) {
      await connectToDatabase();
      db = getDbStatus();
    }
    res.status(db.connected ? 200 : 503).json({
      status: db.connected ? 'ok' : 'degraded',
      database: 'mongodb',
      ...db,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/daily-works', dailyWorkRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/rentals', rentalRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/notifications', notificationRoutes);

  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(500).send('Production build missing. Run "npm run build" first.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.use(errorHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`HaulLedger online server listening on port ${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
