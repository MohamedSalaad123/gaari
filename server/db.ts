import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'Fuel',
  'Food',
  'Maintenance',
  'Road fees',
  'Loading and unloading',
  'Driver allowance',
  'Other expenses',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true },
    fullName: { type: String, required: true, default: 'Administrator', trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, default: 'admin', enum: ['admin'] },
    tokenVersion: { type: Number, required: true, default: 1 },
  },
  { timestamps: true }
);

const loginAttemptSchema = new Schema(
  {
    attemptKey: { type: String, required: true, unique: true },
    attempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

const vehicleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    plateNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    vehicleType: { type: String, required: true, trim: true },
    driverName: { type: String, required: true, trim: true },
    driverPhone: { type: String, required: true, trim: true },
    ownership: { type: String, required: true, enum: ['company', 'rented'] },
    dailyRentalAmount: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      required: true,
      default: 'Active',
      enum: ['Active', 'Inactive', 'Maintenance'],
    },
  },
  { timestamps: true }
);

const dailyWorkSchema = new Schema(
  {
    workDate: { type: String, required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    driverName: { type: String, required: true, trim: true },
    cargoDescription: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    tripsCount: { type: Number, required: true, default: 1, min: 1 },
    incomeReceived: { type: Number, required: true, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true },
    clientRequestId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);
dailyWorkSchema.index({ vehicleId: 1, workDate: 1 });

const expenseSchema = new Schema(
  {
    expenseDate: { type: String, required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    category: { type: String, required: true, enum: EXPENSE_CATEGORIES },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    clientRequestId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

const rentalObligationSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    workDate: { type: String, required: true, index: true },
    dailyRate: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);
rentalObligationSchema.index({ vehicleId: 1, workDate: 1 }, { unique: true });

const rentalPaymentSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    paymentDate: { type: String, required: true, index: true },
    amountPaid: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, required: true, default: 'Cash', trim: true },
    notes: { type: String, default: '', trim: true },
    clientRequestId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['vehicle_maintenance', 'rental_payment'],
    },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    vehicleName: { type: String, required: true, trim: true },
    plateNumber: { type: String, required: true, trim: true },
    amount: { type: Number, default: null },
    paymentMethod: { type: String, default: null },
    paymentDate: { type: String, default: null },
    read: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true }
);
notificationSchema.index({ read: 1, createdAt: -1 });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };
export type VehicleDoc = InferSchemaType<typeof vehicleSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };
export type DailyWorkDoc = InferSchemaType<typeof dailyWorkSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };
export type ExpenseDoc = InferSchemaType<typeof expenseSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };
export type RentalObligationDoc = InferSchemaType<typeof rentalObligationSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };
export type RentalPaymentDoc = InferSchemaType<typeof rentalPaymentSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };
export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date };

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export const LoginAttemptModel =
  mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', loginAttemptSchema);
export const VehicleModel = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
export const DailyWorkModel =
  mongoose.models.DailyWork || mongoose.model('DailyWork', dailyWorkSchema);
export const ExpenseModel = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
export const RentalObligationModel =
  mongoose.models.RentalObligation || mongoose.model('RentalObligation', rentalObligationSchema);
export const RentalPaymentModel =
  mongoose.models.RentalPayment || mongoose.model('RentalPayment', rentalPaymentSchema);
export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

let connectPromise: Promise<boolean> | null = null;
let lastDbError: string | null = null;

export function getMongoUri(): string {
  return (process.env.MONGODB_URI || process.env.MONGO_URL || '').trim();
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getDbStatus(): {
  configured: boolean;
  connected: boolean;
  state: string;
  error: string | null;
  dbName: string | null;
} {
  const uri = getMongoUri();
  const readyState = mongoose.connection.readyState;
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    configured: Boolean(uri),
    connected: readyState === 1,
    state: states[readyState] ?? 'unknown',
    error: lastDbError,
    dbName: readyState === 1 ? mongoose.connection.name || 'haulledger' : null,
  };
}

export async function connectToDatabase(overrideUri?: string): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    lastDbError = null;
    return true;
  }

  const uri = (overrideUri ?? getMongoUri()).trim();
  if (!uri) {
    lastDbError =
      'MONGODB_URI is not configured. Set MONGODB_URI to your MongoDB Atlas connection string.';
    return false;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10,
      });
      lastDbError = null;
      console.log(`Connected to MongoDB (${mongoose.connection.name || 'default'})`);
      return true;
    } catch (err) {
      lastDbError = err instanceof Error ? err.message : 'Failed to connect to MongoDB.';
      console.error('[MongoDB Connection Error]', lastDbError);
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function closeDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Ensures rental obligation consistency for a given (vehicleId, workDate).
 * - Only rented vehicles generate obligations.
 * - Calculated at most ONCE per vehicle per working day regardless of trip count.
 * - If no daily_works remain for (vehicleId, workDate), any obligation for that day is removed.
 */
export async function syncRentalObligationForDay(
  vehicleId: mongoose.Types.ObjectId | string,
  workDate: string
): Promise<void> {
  const vId = typeof vehicleId === 'string' ? new mongoose.Types.ObjectId(vehicleId) : vehicleId;

  const workCount = await DailyWorkModel.countDocuments({ vehicleId: vId, workDate });
  if (workCount === 0) {
    await RentalObligationModel.deleteOne({ vehicleId: vId, workDate });
    return;
  }

  const vehicle = await VehicleModel.findById(vId).select('ownership dailyRentalAmount').lean();
  if (!vehicle || vehicle.ownership !== 'rented') {
    await RentalObligationModel.deleteOne({ vehicleId: vId, workDate });
    return;
  }

  // Insert at most once per (vehicleId, workDate); never overwrite an existing day's locked obligation rate
  await RentalObligationModel.updateOne(
    { vehicleId: vId, workDate },
    {
      $setOnInsert: {
        vehicleId: vId,
        workDate,
        dailyRate: vehicle.dailyRentalAmount,
      },
    },
    { upsert: true }
  );
}
