import { Router } from 'express';
import {
  DailyWorkModel,
  ExpenseModel,
  RentalObligationModel,
  RentalPaymentModel,
  VehicleModel,
} from '../db.ts';
import { publishNotification } from '../notifications.ts';
import { AppError, requireAuth } from '../security.ts';
import {
  requireEnum,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireObjectId,
  requirePositiveNumber,
} from '../validation.ts';

const router = Router();
router.use(requireAuth);

const OWNERSHIP_TYPES = ['company', 'rented'] as const;
const VEHICLE_STATUSES = ['Active', 'Inactive', 'Maintenance'] as const;

function serializeVehicle(
  v: {
    _id: { toString(): string };
    name: string;
    plateNumber: string;
    vehicleType: string;
    driverName: string;
    driverPhone: string;
    ownership: string;
    dailyRentalAmount: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  stats?: { totalTrips: number; totalIncome: number; workingDays: number }
) {
  return {
    id: v._id.toString(),
    name: v.name,
    plate_number: v.plateNumber,
    vehicle_type: v.vehicleType,
    driver_name: v.driverName,
    driver_phone: v.driverPhone,
    ownership: v.ownership,
    daily_rental_amount: v.dailyRentalAmount,
    status: v.status,
    created_at: v.createdAt.toISOString(),
    updated_at: v.updatedAt.toISOString(),
    total_trips: stats?.totalTrips ?? 0,
    total_income: Math.round((stats?.totalIncome ?? 0) * 100) / 100,
    working_days: stats?.workingDays ?? 0,
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const [vehicles, workStats] = await Promise.all([
      VehicleModel.find().sort({ createdAt: -1 }).lean(),
      DailyWorkModel.aggregate<{
        _id: { toString(): string };
        totalTrips: number;
        totalIncome: number;
        dates: string[];
      }>([
        {
          $group: {
            _id: '$vehicleId',
            totalTrips: { $sum: '$tripsCount' },
            totalIncome: { $sum: '$incomeReceived' },
            dates: { $addToSet: '$workDate' },
          },
        },
      ]),
    ]);

    const statsMap = new Map(
      workStats.map((s) => [
        s._id.toString(),
        {
          totalTrips: s.totalTrips,
          totalIncome: s.totalIncome,
          workingDays: s.dates.length,
        },
      ])
    );

    res.json({
      vehicles: vehicles.map((v) => serializeVehicle(v, statsMap.get(v._id.toString()))),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = requireNonEmptyString(req.body?.name, 'Vehicle name', 120);
    const plateNumber = requireNonEmptyString(req.body?.plate_number, 'Plate number', 40).toUpperCase();
    const vehicleType = requireNonEmptyString(req.body?.vehicle_type, 'Vehicle type', 80);
    const driverName = requireNonEmptyString(req.body?.driver_name, 'Driver name', 100);
    const driverPhone = requireNonEmptyString(req.body?.driver_phone, 'Driver phone', 40);
    const ownership = requireEnum(req.body?.ownership, OWNERSHIP_TYPES, 'Ownership');
    const status = requireEnum(req.body?.status ?? 'Active', VEHICLE_STATUSES, 'Vehicle status');

    const dailyRentalAmount =
      ownership === 'rented'
        ? requirePositiveNumber(req.body?.daily_rental_amount, 'Daily rental amount')
        : 0;

    const existingPlate = await VehicleModel.findOne({ plateNumber }).select('_id').lean();
    if (existingPlate) {
      throw new AppError(
        `A vehicle with plate number "${plateNumber}" is already registered.`,
        409,
        'DUPLICATE_PLATE'
      );
    }

    const created = await VehicleModel.create({
      name,
      plateNumber,
      vehicleType,
      driverName,
      driverPhone,
      ownership,
      dailyRentalAmount,
      status,
    });

    if (created.status === 'Maintenance') {
      await publishNotification({
        type: 'vehicle_maintenance',
        vehicleId: created._id,
        vehicleName: created.name,
        plateNumber: created.plateNumber,
      });
    }

    res.status(201).json({ vehicle: serializeVehicle(created) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Vehicle ID');
    const existing = await VehicleModel.findById(id);
    if (!existing) {
      throw new AppError('Vehicle not found.', 404, 'NOT_FOUND');
    }

    const name = requireNonEmptyString(req.body?.name, 'Vehicle name', 120);
    const plateNumber = requireNonEmptyString(req.body?.plate_number, 'Plate number', 40).toUpperCase();
    const vehicleType = requireNonEmptyString(req.body?.vehicle_type, 'Vehicle type', 80);
    const driverName = requireNonEmptyString(req.body?.driver_name, 'Driver name', 100);
    const driverPhone = requireNonEmptyString(req.body?.driver_phone, 'Driver phone', 40);
    const ownership = requireEnum(req.body?.ownership, OWNERSHIP_TYPES, 'Ownership');
    const status = requireEnum(req.body?.status, VEHICLE_STATUSES, 'Vehicle status');

    const dailyRentalAmount =
      ownership === 'rented'
        ? requirePositiveNumber(req.body?.daily_rental_amount, 'Daily rental amount')
        : requireNonNegativeNumber(0, 'Daily rental amount');

    const conflict = await VehicleModel.findOne({ plateNumber, _id: { $ne: id } })
      .select('_id')
      .lean();
    if (conflict) {
      throw new AppError(
        `Another vehicle already uses plate number "${plateNumber}".`,
        409,
        'DUPLICATE_PLATE'
      );
    }

    const previousStatus = existing.status;

    existing.name = name;
    existing.plateNumber = plateNumber;
    existing.vehicleType = vehicleType;
    existing.driverName = driverName;
    existing.driverPhone = driverPhone;
    existing.ownership = ownership;
    existing.dailyRentalAmount = dailyRentalAmount;
    existing.status = status;
    await existing.save();

    if (previousStatus !== 'Maintenance' && existing.status === 'Maintenance') {
      await publishNotification({
        type: 'vehicle_maintenance',
        vehicleId: existing._id,
        vehicleName: existing.name,
        plateNumber: existing.plateNumber,
      });
    }

    res.json({ vehicle: serializeVehicle(existing) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Vehicle ID');
    const existing = await VehicleModel.findById(id).select('name').lean();
    if (!existing) {
      throw new AppError('Vehicle not found.', 404, 'NOT_FOUND');
    }

    const [workCount, expenseCount, paymentCount] = await Promise.all([
      DailyWorkModel.countDocuments({ vehicleId: id }),
      ExpenseModel.countDocuments({ vehicleId: id }),
      RentalPaymentModel.countDocuments({ vehicleId: id }),
    ]);

    if (workCount > 0 || expenseCount > 0 || paymentCount > 0) {
      throw new AppError(
        `Cannot delete "${existing.name}" because it has existing work, expense, or rental payment history. Set its status to Inactive instead.`,
        409,
        'VEHICLE_IN_USE'
      );
    }

    await RentalObligationModel.deleteMany({ vehicleId: id });
    await VehicleModel.deleteOne({ _id: id });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
