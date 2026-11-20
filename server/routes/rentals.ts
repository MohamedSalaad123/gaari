import { Router } from 'express';
import {
  DailyWorkModel,
  RentalObligationModel,
  RentalPaymentModel,
  VehicleModel,
} from '../db.ts';
import { publishNotification } from '../notifications.ts';
import { AppError, requireAuth } from '../security.ts';
import {
  optionalString,
  requireDateString,
  requireNonEmptyString,
  requireObjectId,
  requirePositiveNumber,
} from '../validation.ts';

const router = Router();
router.use(requireAuth);

interface PopulatedVehicle {
  _id: { toString(): string };
  name: string;
  plateNumber: string;
}

function serializePayment(
  p: {
    _id: { toString(): string };
    vehicleId: PopulatedVehicle | { toString(): string };
    paymentDate: string;
    amountPaid: number;
    paymentMethod: string;
    notes: string;
    createdAt: Date;
  },
  fallbackVehicle?: PopulatedVehicle
) {
  const veh =
    fallbackVehicle ||
    (typeof p.vehicleId === 'object' && 'plateNumber' in p.vehicleId ? p.vehicleId : null);

  return {
    id: p._id.toString(),
    vehicle_id: veh ? veh._id.toString() : p.vehicleId.toString(),
    vehicle_name: veh ? veh.name : 'Unknown Vehicle',
    plate_number: veh ? veh.plateNumber : '',
    payment_date: p.paymentDate,
    amount_paid: Math.round(p.amountPaid * 100) / 100,
    payment_method: p.paymentMethod,
    notes: p.notes || '',
    created_at: p.createdAt.toISOString(),
  };
}

router.get('/summary', async (_req, res, next) => {
  try {
    const [rentedVehicles, obStats, payStats] = await Promise.all([
      VehicleModel.find({ ownership: 'rented' }).sort({ name: 1 }).lean(),
      RentalObligationModel.aggregate<{
        _id: { toString(): string };
        workingDays: number;
        totalDue: number;
      }>([
        {
          $group: {
            _id: '$vehicleId',
            workingDays: { $sum: 1 },
            totalDue: { $sum: '$dailyRate' },
          },
        },
      ]),
      RentalPaymentModel.aggregate<{
        _id: { toString(): string };
        amountPaid: number;
      }>([
        {
          $group: {
            _id: '$vehicleId',
            amountPaid: { $sum: '$amountPaid' },
          },
        },
      ]),
    ]);

    const obMap = new Map(obStats.map((r) => [r._id.toString(), r]));
    const payMap = new Map(payStats.map((r) => [r._id.toString(), r]));

    const vehicles = rentedVehicles
      .map((v) => {
        const vid = v._id.toString();
        const ob = obMap.get(vid);
        const pay = payMap.get(vid);
        const workingDays = ob?.workingDays ?? 0;
        const totalRentalDue = Math.round((ob?.totalDue ?? 0) * 100) / 100;
        const amountPaid = Math.round((pay?.amountPaid ?? 0) * 100) / 100;
        const outstandingBalance = Math.round((totalRentalDue - amountPaid) * 100) / 100;

        return {
          vehicle_id: vid,
          name: v.name,
          plate_number: v.plateNumber,
          vehicle_type: v.vehicleType,
          driver_name: v.driverName,
          daily_rental_amount: v.dailyRentalAmount,
          status: v.status,
          working_days: workingDays,
          total_rental_due: totalRentalDue,
          amount_paid: amountPaid,
          outstanding_balance: outstandingBalance,
        };
      })
      .sort((a, b) => b.outstanding_balance - a.outstanding_balance || a.name.localeCompare(b.name));

    const totals = vehicles.reduce(
      (acc, v) => {
        acc.totalWorkingDays += v.working_days;
        acc.totalRentalDue = Math.round((acc.totalRentalDue + v.total_rental_due) * 100) / 100;
        acc.totalAmountPaid = Math.round((acc.totalAmountPaid + v.amount_paid) * 100) / 100;
        acc.totalOutstanding =
          Math.round((acc.totalOutstanding + v.outstanding_balance) * 100) / 100;
        return acc;
      },
      {
        totalWorkingDays: 0,
        totalRentalDue: 0,
        totalAmountPaid: 0,
        totalOutstanding: 0,
      }
    );

    res.json({ vehicles, totals });
  } catch (err) {
    next(err);
  }
});

router.get('/obligations', async (req, res, next) => {
  try {
    const { vehicleId } = req.query;
    const filter: Record<string, unknown> = {};

    if (typeof vehicleId === 'string' && vehicleId.trim() && vehicleId !== 'all') {
      filter.vehicleId = requireObjectId(vehicleId, 'Vehicle ID');
    }

    const [docs, tripAgg] = await Promise.all([
      RentalObligationModel.find(filter)
        .populate('vehicleId', 'name plateNumber')
        .sort({ workDate: -1, createdAt: -1 })
        .lean(),
      DailyWorkModel.aggregate<{ _id: { vehicleId: { toString(): string }; workDate: string }; trips: number }>([
        ...(filter.vehicleId ? [{ $match: { vehicleId: filter.vehicleId } }] : []),
        {
          $group: {
            _id: { vehicleId: '$vehicleId', workDate: '$workDate' },
            trips: { $sum: '$tripsCount' },
          },
        },
      ]),
    ]);

    const tripMap = new Map(
      tripAgg.map((t) => [`${t._id.vehicleId.toString()}::${t._id.workDate}`, t.trips])
    );

    const obligations = docs.map((ob) => {
      const veh = ob.vehicleId as unknown as PopulatedVehicle | null;
      const vid = veh?._id?.toString?.() ?? String(ob.vehicleId);
      return {
        id: ob._id.toString(),
        vehicle_id: vid,
        vehicle_name: veh?.name ?? 'Unknown Vehicle',
        plate_number: veh?.plateNumber ?? '',
        work_date: ob.workDate,
        daily_rate: Math.round(ob.dailyRate * 100) / 100,
        trips_count: tripMap.get(`${vid}::${ob.workDate}`) ?? 0,
      };
    });

    res.json({ obligations });
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    const { vehicleId, startDate, endDate } = req.query;
    const filter: Record<string, unknown> = {};

    if (typeof vehicleId === 'string' && vehicleId.trim() && vehicleId !== 'all') {
      filter.vehicleId = requireObjectId(vehicleId, 'Vehicle ID');
    }
    if (typeof startDate === 'string' && startDate.trim()) {
      filter.paymentDate = {
        ...(filter.paymentDate as object),
        $gte: requireDateString(startDate, 'Start date'),
      };
    }
    if (typeof endDate === 'string' && endDate.trim()) {
      filter.paymentDate = {
        ...(filter.paymentDate as object),
        $lte: requireDateString(endDate, 'End date'),
      };
    }

    const docs = await RentalPaymentModel.find(filter)
      .populate('vehicleId', 'name plateNumber')
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    res.json({
      payments: docs.map((p) => serializePayment(p as unknown as Parameters<typeof serializePayment>[0])),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/payments', async (req, res, next) => {
  try {
    const vehicleId = requireObjectId(req.body?.vehicle_id, 'Rented vehicle');
    const paymentDate = requireDateString(req.body?.payment_date, 'Payment date');
    const amountPaid = requirePositiveNumber(req.body?.amount_paid, 'Amount paid');
    const paymentMethod = requireNonEmptyString(
      req.body?.payment_method ?? 'Cash',
      'Payment method',
      60
    );
    const notes = optionalString(req.body?.notes, 500);
    const clientRequestId =
      typeof req.body?.client_request_id === 'string' && req.body.client_request_id.trim()
        ? req.body.client_request_id.trim().slice(0, 100)
        : undefined;

    if (clientRequestId) {
      const duplicate = await RentalPaymentModel.findOne({ clientRequestId })
        .populate('vehicleId', 'name plateNumber')
        .lean();
      if (duplicate) {
        res.status(200).json({
          payment: serializePayment(duplicate as unknown as Parameters<typeof serializePayment>[0]),
          deduplicated: true,
        });
        return;
      }
    }

    const vehicle = await VehicleModel.findById(vehicleId)
      .select('name plateNumber ownership')
      .lean();
    if (!vehicle) {
      throw new AppError('Selected vehicle was not found.', 404, 'VEHICLE_NOT_FOUND');
    }

    if (vehicle.ownership !== 'rented') {
      throw new AppError(
        `"${vehicle.name}" is company-owned and does not generate rental obligations.`,
        400,
        'NOT_RENTED_VEHICLE'
      );
    }

    const [dueAgg, paidAgg] = await Promise.all([
      RentalObligationModel.aggregate<{ totalDue: number }>([
        { $match: { vehicleId } },
        { $group: { _id: null, totalDue: { $sum: '$dailyRate' } } },
      ]),
      RentalPaymentModel.aggregate<{ totalPaid: number }>([
        { $match: { vehicleId } },
        { $group: { _id: null, totalPaid: { $sum: '$amountPaid' } } },
      ]),
    ]);

    const totalDue = dueAgg[0]?.totalDue ?? 0;
    const totalPaid = paidAgg[0]?.totalPaid ?? 0;
    const outstanding = Math.round((totalDue - totalPaid) * 100) / 100;

    if (outstanding <= 0) {
      throw new AppError(
        `"${vehicle.name}" has no outstanding rental balance due.`,
        400,
        'NO_OUTSTANDING_BALANCE'
      );
    }

    if (amountPaid > outstanding) {
      throw new AppError(
        `Payment ($${amountPaid.toFixed(2)}) exceeds outstanding rental balance ($${outstanding.toFixed(2)}).`,
        400,
        'EXCEEDS_OUTSTANDING_BALANCE'
      );
    }

    const created = await RentalPaymentModel.create({
      vehicleId,
      paymentDate,
      amountPaid,
      paymentMethod,
      notes,
      ...(clientRequestId ? { clientRequestId } : {}),
    });

    await publishNotification({
      type: 'rental_payment',
      vehicleId,
      vehicleName: vehicle.name,
      plateNumber: vehicle.plateNumber,
      amount: created.amountPaid,
      paymentMethod: created.paymentMethod,
      paymentDate: created.paymentDate,
    });

    res.status(201).json({
      payment: serializePayment(created, vehicle as unknown as PopulatedVehicle),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/payments/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Payment ID');
    const deleted = await RentalPaymentModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new AppError('Rental payment record not found.', 404, 'NOT_FOUND');
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
