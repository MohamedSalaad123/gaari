import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import {
  closeDatabase,
  connectToDatabase,
  DailyWorkModel,
  ExpenseModel,
  getDbStatus,
  RentalObligationModel,
  RentalPaymentModel,
  VehicleModel,
} from './db.ts';
import { AppError } from './security.ts';

export interface BackupCollections {
  vehicles: Record<string, unknown>[];
  dailyWorks: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  rentalObligations: Record<string, unknown>[];
  rentalPayments: Record<string, unknown>[];
}

export interface DatabaseBackupSnapshot {
  app: 'HaulLedger';
  version: number;
  database: 'mongodb';
  dbName: string;
  exportedAt: string;
  checksumSha256: string;
  counts: {
    vehicles: number;
    dailyWorks: number;
    expenses: number;
    rentalObligations: number;
    rentalPayments: number;
    totalRecords: number;
  };
  collections: BackupCollections;
}

export function computeCollectionsChecksum(collections: BackupCollections): string {
  return crypto.createHash('sha256').update(JSON.stringify(collections)).digest('hex');
}

export async function createDatabaseJsonDump(): Promise<{
  snapshot: DatabaseBackupSnapshot;
  jsonBuffer: Buffer;
  fileName: string;
}> {
  const [vehicles, dailyWorks, expenses, rentalObligations, rentalPayments] = await Promise.all([
    VehicleModel.find().sort({ _id: 1 }).lean(),
    DailyWorkModel.find().sort({ _id: 1 }).lean(),
    ExpenseModel.find().sort({ _id: 1 }).lean(),
    RentalObligationModel.find().sort({ _id: 1 }).lean(),
    RentalPaymentModel.find().sort({ _id: 1 }).lean(),
  ]);

  const collections: BackupCollections = {
    vehicles: vehicles as Record<string, unknown>[],
    dailyWorks: dailyWorks as Record<string, unknown>[],
    expenses: expenses as Record<string, unknown>[],
    rentalObligations: rentalObligations as Record<string, unknown>[],
    rentalPayments: rentalPayments as Record<string, unknown>[],
  };

  const totalRecords =
    vehicles.length +
    dailyWorks.length +
    expenses.length +
    rentalObligations.length +
    rentalPayments.length;

  const dbStatus = getDbStatus();
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const timeStamp = now.toISOString().slice(11, 19).replace(/:/g, '');

  const snapshot: DatabaseBackupSnapshot = {
    app: 'HaulLedger',
    version: 2,
    database: 'mongodb',
    dbName: dbStatus.dbName || 'haulledger',
    exportedAt: now.toISOString(),
    checksumSha256: computeCollectionsChecksum(collections),
    counts: {
      vehicles: vehicles.length,
      dailyWorks: dailyWorks.length,
      expenses: expenses.length,
      rentalObligations: rentalObligations.length,
      rentalPayments: rentalPayments.length,
      totalRecords,
    },
    collections,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8');
  const fileName = `haulledger_backup_${dateStamp}_${timeStamp}.json`;

  return { snapshot, jsonBuffer, fileName };
}

function toObjectId(val: unknown): mongoose.Types.ObjectId {
  if (typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)) {
    return new mongoose.Types.ObjectId(val);
  }
  throw new AppError('Backup contains invalid record identifiers.', 400, 'INVALID_BACKUP');
}

function parseOptionalDate(val: unknown): Date | undefined {
  if (typeof val === 'string' || val instanceof Date) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

export function verifyAndPrepareRestoreDocs(rawJsonText: string) {
  let parsed: {
    app?: string;
    checksumSha256?: string;
    collections?: {
      vehicles?: unknown[];
      dailyWorks?: unknown[];
      expenses?: unknown[];
      rentalObligations?: unknown[];
      rentalPayments?: unknown[];
    };
  };

  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new AppError('Uploaded file is not valid JSON.', 400, 'INVALID_BACKUP');
  }

  if (
    parsed?.app !== 'HaulLedger' ||
    !parsed.collections ||
    !Array.isArray(parsed.collections.vehicles) ||
    !Array.isArray(parsed.collections.dailyWorks) ||
    !Array.isArray(parsed.collections.expenses) ||
    !Array.isArray(parsed.collections.rentalObligations) ||
    !Array.isArray(parsed.collections.rentalPayments)
  ) {
    throw new AppError(
      'Backup file structure is incompatible with HaulLedger.',
      400,
      'INCOMPATIBLE_BACKUP'
    );
  }

  if (typeof parsed.checksumSha256 === 'string' && parsed.checksumSha256.length > 0) {
    const expected = computeCollectionsChecksum(parsed.collections as BackupCollections);
    if (expected !== parsed.checksumSha256) {
      throw new AppError(
        'Backup integrity check failed: checksum mismatch.',
        400,
        'CORRUPTED_BACKUP'
      );
    }
  }

  const { vehicles, dailyWorks, expenses, rentalObligations, rentalPayments } = parsed.collections;

  const vehicleDocs = vehicles.map((raw) => {
    const r = raw as Record<string, unknown>;
    const createdAt = parseOptionalDate(r.createdAt);
    const updatedAt = parseOptionalDate(r.updatedAt);
    return {
      _id: toObjectId(r._id),
      name: String(r.name ?? ''),
      plateNumber: String(r.plateNumber ?? '').toUpperCase(),
      vehicleType: String(r.vehicleType ?? ''),
      driverName: String(r.driverName ?? ''),
      driverPhone: String(r.driverPhone ?? ''),
      ownership: r.ownership === 'rented' ? 'rented' : 'company',
      dailyRentalAmount: Number(r.dailyRentalAmount ?? 0),
      status: r.status === 'Inactive' || r.status === 'Maintenance' ? r.status : 'Active',
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });

  const dailyWorkDocs = dailyWorks.map((raw) => {
    const r = raw as Record<string, unknown>;
    const createdAt = parseOptionalDate(r.createdAt);
    const updatedAt = parseOptionalDate(r.updatedAt);
    return {
      _id: toObjectId(r._id),
      workDate: String(r.workDate ?? ''),
      vehicleId: toObjectId(r.vehicleId),
      driverName: String(r.driverName ?? ''),
      cargoDescription: String(r.cargoDescription ?? ''),
      destination: String(r.destination ?? ''),
      tripsCount: Number(r.tripsCount ?? 1),
      incomeReceived: Number(r.incomeReceived ?? 0),
      notes: String(r.notes ?? ''),
      ...(typeof r.clientRequestId === 'string' && r.clientRequestId
        ? { clientRequestId: r.clientRequestId }
        : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });

  const expenseDocs = expenses.map((raw) => {
    const r = raw as Record<string, unknown>;
    const createdAt = parseOptionalDate(r.createdAt);
    const updatedAt = parseOptionalDate(r.updatedAt);
    return {
      _id: toObjectId(r._id),
      expenseDate: String(r.expenseDate ?? ''),
      vehicleId: toObjectId(r.vehicleId),
      category: String(r.category ?? 'Other expenses'),
      description: String(r.description ?? ''),
      amount: Number(r.amount ?? 0),
      ...(typeof r.clientRequestId === 'string' && r.clientRequestId
        ? { clientRequestId: r.clientRequestId }
        : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });

  const obligationDocs = rentalObligations.map((raw) => {
    const r = raw as Record<string, unknown>;
    const createdAt = parseOptionalDate(r.createdAt);
    const updatedAt = parseOptionalDate(r.updatedAt);
    return {
      _id: toObjectId(r._id),
      vehicleId: toObjectId(r.vehicleId),
      workDate: String(r.workDate ?? ''),
      dailyRate: Number(r.dailyRate ?? 0),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });

  const paymentDocs = rentalPayments.map((raw) => {
    const r = raw as Record<string, unknown>;
    const createdAt = parseOptionalDate(r.createdAt);
    const updatedAt = parseOptionalDate(r.updatedAt);
    return {
      _id: toObjectId(r._id),
      vehicleId: toObjectId(r.vehicleId),
      paymentDate: String(r.paymentDate ?? ''),
      amountPaid: Number(r.amountPaid ?? 0),
      paymentMethod: String(r.paymentMethod ?? 'Cash'),
      notes: String(r.notes ?? ''),
      ...(typeof r.clientRequestId === 'string' && r.clientRequestId
        ? { clientRequestId: r.clientRequestId }
        : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });

  return {
    vehicleDocs,
    dailyWorkDocs,
    expenseDocs,
    obligationDocs,
    paymentDocs,
  };
}

async function runCliBackup() {
  const connected = await connectToDatabase();
  if (!connected) {
    console.error('Failed to connect to MongoDB. Check MONGODB_URI.');
    process.exit(1);
  }

  try {
    const { snapshot, jsonBuffer, fileName } = await createDatabaseJsonDump();
    const targetArg = process.argv[2];
    const outputPath = targetArg
      ? path.resolve(process.cwd(), targetArg)
      : path.resolve(process.cwd(), 'backups', fileName);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, jsonBuffer);

    console.log(
      `HaulLedger JSON backup created: ${outputPath} (${snapshot.counts.totalRecords} records, SHA-256: ${snapshot.checksumSha256})`
    );
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCliBackup().catch((err) => {
    console.error('Backup CLI failed:', err);
    process.exit(1);
  });
}
