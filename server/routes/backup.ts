import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { createDatabaseJsonDump, verifyAndPrepareRestoreDocs } from '../backupUtility.ts';
import {
  DailyWorkModel,
  ExpenseModel,
  getDbStatus,
  RentalObligationModel,
  RentalPaymentModel,
  VehicleModel,
} from '../db.ts';
import { AppError, requireAuth } from '../security.ts';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get('/info', async (_req, res, next) => {
  try {
    const dbStatus = getDbStatus();
    const [vehicles, dailyWorks, expenses, rentalObligations, rentalPayments] = await Promise.all([
      VehicleModel.countDocuments(),
      DailyWorkModel.countDocuments(),
      ExpenseModel.countDocuments(),
      RentalObligationModel.countDocuments(),
      RentalPaymentModel.countDocuments(),
    ]);

    res.json({
      provider: 'MongoDB Atlas',
      dbName: dbStatus.dbName || 'haulledger',
      connected: dbStatus.connected,
      lastChecked: new Date().toISOString(),
      counts: {
        vehicles,
        dailyWorks,
        expenses,
        rentalObligations,
        rentalPayments,
      },
    });
  } catch (err) {
    next(err);
  }
});

async function handleJsonDumpDownload(_req: Request, res: Response, next: NextFunction) {
  try {
    const { snapshot, jsonBuffer, fileName } = await createDatabaseJsonDump();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Backup-Checksum', snapshot.checksumSha256);
    res.setHeader('X-Backup-Total-Records', String(snapshot.counts.totalRecords));
    res.send(jsonBuffer);
  } catch (err) {
    next(err);
  }
}

router.get('/download', handleJsonDumpDownload);
router.post('/dump', handleJsonDumpDownload);

router.post('/restore', upload.single('database'), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      throw new AppError('Please select a JSON backup file to restore.', 400, 'NO_FILE');
    }

    const { vehicleDocs, dailyWorkDocs, expenseDocs, obligationDocs, paymentDocs } =
      verifyAndPrepareRestoreDocs(req.file.buffer.toString('utf8'));

    // Clear and restore operational collections (preserving admin User accounts)
    await Promise.all([
      RentalPaymentModel.deleteMany({}),
      RentalObligationModel.deleteMany({}),
      ExpenseModel.deleteMany({}),
      DailyWorkModel.deleteMany({}),
      VehicleModel.deleteMany({}),
    ]);

    if (vehicleDocs.length > 0) await VehicleModel.insertMany(vehicleDocs);
    if (dailyWorkDocs.length > 0) await DailyWorkModel.insertMany(dailyWorkDocs);
    if (expenseDocs.length > 0) await ExpenseModel.insertMany(expenseDocs);
    if (obligationDocs.length > 0) await RentalObligationModel.insertMany(obligationDocs);
    if (paymentDocs.length > 0) await RentalPaymentModel.insertMany(paymentDocs);

    res.json({
      success: true,
      message: 'MongoDB database restored successfully from JSON backup.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
