import { Router } from 'express';
import { DailyWorkModel, syncRentalObligationForDay, VehicleModel } from '../db.ts';
import { AppError, requireAuth } from '../security.ts';
import {
  escapeRegex,
  optionalString,
  requireDateString,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireObjectId,
  requirePositiveInt,
} from '../validation.ts';

const router = Router();
router.use(requireAuth);

interface PopulatedVehicle {
  _id: { toString(): string };
  name: string;
  plateNumber: string;
  ownership: string;
  dailyRentalAmount: number;
}

function serializeDailyWork(dw: {
  _id: { toString(): string };
  workDate: string;
  vehicleId: PopulatedVehicle | { toString(): string };
  driverName: string;
  cargoDescription: string;
  destination: string;
  tripsCount: number;
  incomeReceived: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}, fallbackVehicle?: PopulatedVehicle) {
  const veh =
    fallbackVehicle ||
    (typeof dw.vehicleId === 'object' && 'plateNumber' in dw.vehicleId ? dw.vehicleId : null);

  return {
    id: dw._id.toString(),
    work_date: dw.workDate,
    vehicle_id: veh ? veh._id.toString() : dw.vehicleId.toString(),
    vehicle_name: veh ? veh.name : 'Unknown Vehicle',
    plate_number: veh ? veh.plateNumber : '',
    ownership: veh ? veh.ownership : 'company',
    daily_rental_amount: veh ? veh.dailyRentalAmount : 0,
    driver_name: dw.driverName,
    cargo_description: dw.cargoDescription,
    destination: dw.destination,
    trips_count: dw.tripsCount,
    income_received: Math.round(dw.incomeReceived * 100) / 100,
    notes: dw.notes || '',
    created_at: dw.createdAt.toISOString(),
    updated_at: dw.updatedAt.toISOString(),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { startDate, endDate, vehicleId, search } = req.query;
    const filter: Record<string, unknown> = {};

    if (typeof startDate === 'string' && startDate.trim()) {
      filter.workDate = { ...(filter.workDate as object), $gte: requireDateString(startDate, 'Start date') };
    }
    if (typeof endDate === 'string' && endDate.trim()) {
      filter.workDate = { ...(filter.workDate as object), $lte: requireDateString(endDate, 'End date') };
    }
    if (typeof vehicleId === 'string' && vehicleId.trim() && vehicleId !== 'all') {
      filter.vehicleId = requireObjectId(vehicleId, 'Vehicle ID');
    }

    if (typeof search === 'string' && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      const matchingVehicles = await VehicleModel.find({
        $or: [{ name: rx }, { plateNumber: rx }],
      })
        .select('_id')
        .lean();
      const matchedVehicleIds = matchingVehicles.map((v) => v._id);

      filter.$or = [
        { driverName: rx },
        { cargoDescription: rx },
        { destination: rx },
        ...(matchedVehicleIds.length > 0 ? [{ vehicleId: { $in: matchedVehicleIds } }] : []),
      ];
    }

    const docs = await DailyWorkModel.find(filter)
      .populate('vehicleId', 'name plateNumber ownership dailyRentalAmount')
      .sort({ workDate: -1, createdAt: -1 })
      .lean();

    const records = docs.map((doc) =>
      serializeDailyWork(doc as unknown as Parameters<typeof serializeDailyWork>[0])
    );

    res.json({ records });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const workDate = requireDateString(req.body?.work_date, 'Work date');
    const vehicleId = requireObjectId(req.body?.vehicle_id, 'Vehicle');
    const driverName = requireNonEmptyString(req.body?.driver_name, 'Driver name', 100);
    const cargoDescription = requireNonEmptyString(
      req.body?.cargo_description,
      'Cargo description',
      250
    );
    const destination = requireNonEmptyString(req.body?.destination, 'Destination', 160);
    const tripsCount = requirePositiveInt(req.body?.trips_count ?? 1, 'Number of trips');
    const incomeReceived = requireNonNegativeNumber(req.body?.income_received, 'Income received');
    const notes = optionalString(req.body?.notes, 500);
    const clientRequestId =
      typeof req.body?.client_request_id === 'string' && req.body.client_request_id.trim()
        ? req.body.client_request_id.trim().slice(0, 100)
        : undefined;

    if (clientRequestId) {
      const duplicate = await DailyWorkModel.findOne({ clientRequestId })
        .populate('vehicleId', 'name plateNumber ownership dailyRentalAmount')
        .lean();
      if (duplicate) {
        res.status(200).json({
          record: serializeDailyWork(duplicate as unknown as Parameters<typeof serializeDailyWork>[0]),
          deduplicated: true,
        });
        return;
      }
    }

    const vehicle = await VehicleModel.findById(vehicleId)
      .select('name plateNumber ownership dailyRentalAmount status')
      .lean();

    if (!vehicle) {
      throw new AppError('Selected vehicle was not found.', 404, 'VEHICLE_NOT_FOUND');
    }

    const created = await DailyWorkModel.create({
      workDate,
      vehicleId,
      driverName,
      cargoDescription,
      destination,
      tripsCount,
      incomeReceived,
      notes,
      ...(clientRequestId ? { clientRequestId } : {}),
    });

    // Sync rental obligation: at most once per rented vehicle per working day
    await syncRentalObligationForDay(vehicleId, workDate);

    res.status(201).json({
      record: serializeDailyWork(created, vehicle as unknown as PopulatedVehicle),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Work record ID');
    const existing = await DailyWorkModel.findById(id);
    if (!existing) {
      throw new AppError('Work record not found.', 404, 'NOT_FOUND');
    }

    const prevVehicleId = existing.vehicleId;
    const prevWorkDate = existing.workDate;

    const workDate = requireDateString(req.body?.work_date, 'Work date');
    const vehicleId = requireObjectId(req.body?.vehicle_id, 'Vehicle');
    const driverName = requireNonEmptyString(req.body?.driver_name, 'Driver name', 100);
    const cargoDescription = requireNonEmptyString(
      req.body?.cargo_description,
      'Cargo description',
      250
    );
    const destination = requireNonEmptyString(req.body?.destination, 'Destination', 160);
    const tripsCount = requirePositiveInt(req.body?.trips_count ?? 1, 'Number of trips');
    const incomeReceived = requireNonNegativeNumber(req.body?.income_received, 'Income received');
    const notes = optionalString(req.body?.notes, 500);

    const vehicle = await VehicleModel.findById(vehicleId)
      .select('name plateNumber ownership dailyRentalAmount')
      .lean();
    if (!vehicle) {
      throw new AppError('Selected vehicle was not found.', 404, 'VEHICLE_NOT_FOUND');
    }

    existing.workDate = workDate;
    existing.vehicleId = vehicleId;
    existing.driverName = driverName;
    existing.cargoDescription = cargoDescription;
    existing.destination = destination;
    existing.tripsCount = tripsCount;
    existing.incomeReceived = incomeReceived;
    existing.notes = notes;
    await existing.save();

    await syncRentalObligationForDay(prevVehicleId, prevWorkDate);
    if (prevVehicleId.toString() !== vehicleId.toString() || prevWorkDate !== workDate) {
      await syncRentalObligationForDay(vehicleId, workDate);
    }

    res.json({
      record: serializeDailyWork(existing, vehicle as unknown as PopulatedVehicle),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Work record ID');
    const existing = await DailyWorkModel.findById(id);
    if (!existing) {
      throw new AppError('Work record not found.', 404, 'NOT_FOUND');
    }

    const { vehicleId, workDate } = existing;
    await DailyWorkModel.deleteOne({ _id: id });
    await syncRentalObligationForDay(vehicleId, workDate);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
