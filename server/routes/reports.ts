import { Router } from 'express';
import {
  DailyWorkModel,
  ExpenseModel,
  RentalObligationModel,
  RentalPaymentModel,
  VehicleModel,
} from '../db.ts';
import { AppError, requireAuth } from '../security.ts';
import { getTodayIsoDate, requireDateString, requireEnum, requireObjectId } from '../validation.ts';

const router = Router();
router.use(requireAuth);

const REPORT_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'vehicle_income',
  'expense',
  'rental_payment',
] as const;

function getPeriodKey(isoDate: string, type: 'daily' | 'weekly' | 'monthly'): string {
  if (type === 'daily') return isoDate;
  if (type === 'monthly') return isoDate.slice(0, 7);

  // ISO Week (YYYY-Www)
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

router.get('/', async (req, res, next) => {
  try {
    const type = requireEnum(req.query.type ?? 'daily', REPORT_TYPES, 'Report type');
    const today = getTodayIsoDate();
    const defaultStart = `${today.slice(0, 7)}-01`;

    const startDate =
      typeof req.query.startDate === 'string' && req.query.startDate.trim()
        ? requireDateString(req.query.startDate, 'Start date')
        : defaultStart;
    const endDate =
      typeof req.query.endDate === 'string' && req.query.endDate.trim()
        ? requireDateString(req.query.endDate, 'End date')
        : today;

    if (startDate > endDate) {
      throw new AppError('Start date cannot be later than end date.', 400, 'VALIDATION_ERROR');
    }

    const vehicleObjId =
      typeof req.query.vehicleId === 'string' && req.query.vehicleId.trim() && req.query.vehicleId !== 'all'
        ? requireObjectId(req.query.vehicleId, 'Vehicle ID')
        : null;
    const vehicleIdStr = vehicleObjId ? vehicleObjId.toString() : null;

    const workMatch = {
      workDate: { $gte: startDate, $lte: endDate },
      ...(vehicleObjId ? { vehicleId: vehicleObjId } : {}),
    };
    const expMatch = {
      expenseDate: { $gte: startDate, $lte: endDate },
      ...(vehicleObjId ? { vehicleId: vehicleObjId } : {}),
    };
    const rentMatch = {
      workDate: { $gte: startDate, $lte: endDate },
      ...(vehicleObjId ? { vehicleId: vehicleObjId } : {}),
    };

    const [workSummaryAgg, expSummaryAgg, rentSummaryAgg] = await Promise.all([
      DailyWorkModel.aggregate<{ total: number }>([
        { $match: workMatch },
        { $group: { _id: null, total: { $sum: '$incomeReceived' } } },
      ]),
      ExpenseModel.aggregate<{ total: number }>([
        { $match: expMatch },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      RentalObligationModel.aggregate<{ total: number }>([
        { $match: rentMatch },
        { $group: { _id: null, total: { $sum: '$dailyRate' } } },
      ]),
    ]);

    const summaryIncome = workSummaryAgg[0]?.total ?? 0;
    const summaryExpenses = expSummaryAgg[0]?.total ?? 0;
    const summaryRental = rentSummaryAgg[0]?.total ?? 0;

    const summary = {
      totalIncome: Math.round(summaryIncome * 100) / 100,
      totalExpenses: Math.round(summaryExpenses * 100) / 100,
      totalRental: Math.round(summaryRental * 100) / 100,
      netBalance: Math.round((summaryIncome - summaryExpenses - summaryRental) * 100) / 100,
    };

    if (type === 'daily' || type === 'weekly' || type === 'monthly') {
      const [works, expenses, obligations] = await Promise.all([
        DailyWorkModel.find(workMatch).select('workDate vehicleId tripsCount incomeReceived').lean(),
        ExpenseModel.find(expMatch).select('expenseDate amount').lean(),
        RentalObligationModel.find(rentMatch).select('workDate dailyRate').lean(),
      ]);

      const periodMap = new Map<
        string,
        {
          period: string;
          trips: number;
          vehicleSet: Set<string>;
          income: number;
          expenses: number;
          rental: number;
        }
      >();

      const getBucket = (period: string) => {
        let bucket = periodMap.get(period);
        if (!bucket) {
          bucket = {
            period,
            trips: 0,
            vehicleSet: new Set<string>(),
            income: 0,
            expenses: 0,
            rental: 0,
          };
          periodMap.set(period, bucket);
        }
        return bucket;
      };

      for (const w of works) {
        const b = getBucket(getPeriodKey(w.workDate, type));
        b.trips += w.tripsCount;
        b.income += w.incomeReceived;
        b.vehicleSet.add(w.vehicleId.toString());
      }
      for (const e of expenses) {
        const b = getBucket(getPeriodKey(e.expenseDate, type));
        b.expenses += e.amount;
      }
      for (const r of obligations) {
        const b = getBucket(getPeriodKey(r.workDate, type));
        b.rental += r.dailyRate;
      }

      const rows = Array.from(periodMap.values())
        .map((b) => {
          const income = Math.round(b.income * 100) / 100;
          const exp = Math.round(b.expenses * 100) / 100;
          const rental = Math.round(b.rental * 100) / 100;
          return {
            period: b.period,
            vehicles_worked: b.vehicleSet.size,
            trips: b.trips,
            income,
            expenses: exp,
            rental,
            net_balance: Math.round((income - exp - rental) * 100) / 100,
          };
        })
        .sort((a, b) => b.period.localeCompare(a.period));

      res.json({ type, startDate, endDate, vehicleId: vehicleIdStr, summary, rows });
      return;
    }

    if (type === 'vehicle_income') {
      const [vehicles, workAgg, expAgg, rentAgg] = await Promise.all([
        VehicleModel.find(vehicleObjId ? { _id: vehicleObjId } : {}).lean(),
        DailyWorkModel.aggregate<{
          _id: { toString(): string };
          dates: string[];
          trips: number;
          income: number;
        }>([
          { $match: workMatch },
          {
            $group: {
              _id: '$vehicleId',
              dates: { $addToSet: '$workDate' },
              trips: { $sum: '$tripsCount' },
              income: { $sum: '$incomeReceived' },
            },
          },
        ]),
        ExpenseModel.aggregate<{ _id: { toString(): string }; expenses: number }>([
          { $match: expMatch },
          { $group: { _id: '$vehicleId', expenses: { $sum: '$amount' } } },
        ]),
        RentalObligationModel.aggregate<{ _id: { toString(): string }; rental: number }>([
          { $match: rentMatch },
          { $group: { _id: '$vehicleId', rental: { $sum: '$dailyRate' } } },
        ]),
      ]);

      const wMap = new Map(workAgg.map((w) => [w._id.toString(), w]));
      const eMap = new Map(expAgg.map((e) => [e._id.toString(), e.expenses]));
      const rMap = new Map(rentAgg.map((r) => [r._id.toString(), r.rental]));

      const rows = vehicles
        .map((v) => {
          const vid = v._id.toString();
          const w = wMap.get(vid);
          const income = Math.round((w?.income ?? 0) * 100) / 100;
          const expenses = Math.round((eMap.get(vid) ?? 0) * 100) / 100;
          const rental = Math.round((rMap.get(vid) ?? 0) * 100) / 100;
          return {
            vehicle_id: vid,
            vehicle_name: v.name,
            plate_number: v.plateNumber,
            ownership: v.ownership,
            driver_name: v.driverName,
            working_days: w?.dates.length ?? 0,
            trips: w?.trips ?? 0,
            income,
            expenses,
            rental,
            net_balance: Math.round((income - expenses - rental) * 100) / 100,
          };
        })
        .sort((a, b) => b.income - a.income || a.vehicle_name.localeCompare(b.vehicle_name));

      res.json({ type, startDate, endDate, vehicleId: vehicleIdStr, summary, rows });
      return;
    }

    if (type === 'expense') {
      const docs = await ExpenseModel.find(expMatch)
        .populate('vehicleId', 'name plateNumber')
        .sort({ expenseDate: -1, createdAt: -1 })
        .lean();

      const rows = docs.map((e) => {
        const veh = e.vehicleId as unknown as { name?: string; plateNumber?: string } | null;
        return {
          id: e._id.toString(),
          expense_date: e.expenseDate,
          vehicle_name: veh?.name ?? 'Unknown Vehicle',
          plate_number: veh?.plateNumber ?? '',
          category: e.category,
          description: e.description,
          amount: Math.round(e.amount * 100) / 100,
        };
      });

      res.json({ type, startDate, endDate, vehicleId: vehicleIdStr, summary, rows });
      return;
    }

    // rental_payment report
    const payMatch = {
      paymentDate: { $gte: startDate, $lte: endDate },
      ...(vehicleObjId ? { vehicleId: vehicleObjId } : {}),
    };

    const [rentedVehicles, roAgg, rpAgg] = await Promise.all([
      VehicleModel.find({
        ownership: 'rented',
        ...(vehicleObjId ? { _id: vehicleObjId } : {}),
      }).lean(),
      RentalObligationModel.aggregate<{
        _id: { toString(): string };
        workingDays: number;
        totalDue: number;
      }>([
        { $match: rentMatch },
        {
          $group: {
            _id: '$vehicleId',
            workingDays: { $sum: 1 },
            totalDue: { $sum: '$dailyRate' },
          },
        },
      ]),
      RentalPaymentModel.aggregate<{ _id: { toString(): string }; amountPaid: number }>([
        { $match: payMatch },
        { $group: { _id: '$vehicleId', amountPaid: { $sum: '$amountPaid' } } },
      ]),
    ]);

    const roMap = new Map(roAgg.map((r) => [r._id.toString(), r]));
    const rpMap = new Map(rpAgg.map((r) => [r._id.toString(), r.amountPaid]));

    const rows = rentedVehicles
      .map((v) => {
        const vid = v._id.toString();
        const ro = roMap.get(vid);
        const totalDue = Math.round((ro?.totalDue ?? 0) * 100) / 100;
        const amountPaid = Math.round((rpMap.get(vid) ?? 0) * 100) / 100;
        return {
          vehicle_id: vid,
          vehicle_name: v.name,
          plate_number: v.plateNumber,
          daily_rental_amount: v.dailyRentalAmount,
          working_days: ro?.workingDays ?? 0,
          total_due: totalDue,
          amount_paid: amountPaid,
          outstanding_balance: Math.round((totalDue - amountPaid) * 100) / 100,
        };
      })
      .sort(
        (a, b) =>
          b.outstanding_balance - a.outstanding_balance ||
          a.vehicle_name.localeCompare(b.vehicle_name)
      );

    res.json({ type, startDate, endDate, vehicleId: vehicleIdStr, summary, rows });
  } catch (err) {
    next(err);
  }
});

export default router;
