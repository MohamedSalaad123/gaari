import { Router } from 'express';
import {
  DailyWorkModel,
  ExpenseModel,
  RentalObligationModel,
  RentalPaymentModel,
  VehicleModel,
} from '../db.ts';
import { requireAuth } from '../security.ts';
import { getTodayIsoDate, requireDateString } from '../validation.ts';

const router = Router();
router.use(requireAuth);

function shiftDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function computePeriodSummary(startDate: string, endDate: string) {
  const [workAgg, expAgg, rentAgg] = await Promise.all([
    DailyWorkModel.aggregate<{ income: number; trips: number; entries: number }>([
      { $match: { workDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: null,
          income: { $sum: '$incomeReceived' },
          trips: { $sum: '$tripsCount' },
          entries: { $sum: 1 },
        },
      },
    ]),
    ExpenseModel.aggregate<{ expenses: number }>([
      { $match: { expenseDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, expenses: { $sum: '$amount' } } },
    ]),
    RentalObligationModel.aggregate<{ rental: number }>([
      { $match: { workDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, rental: { $sum: '$dailyRate' } } },
    ]),
  ]);

  const income = Math.round((workAgg[0]?.income ?? 0) * 100) / 100;
  const expenses = Math.round((expAgg[0]?.expenses ?? 0) * 100) / 100;
  const rental = Math.round((rentAgg[0]?.rental ?? 0) * 100) / 100;
  const netBalance = Math.round((income - expenses - rental) * 100) / 100;

  return {
    startDate,
    endDate,
    income,
    expenses,
    rental,
    netBalance,
    trips: workAgg[0]?.trips ?? 0,
    entries: workAgg[0]?.entries ?? 0,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const today =
      typeof req.query.date === 'string' && req.query.date.trim()
        ? requireDateString(req.query.date, 'Date')
        : getTodayIsoDate();

    const weekStart = shiftDate(today, -6);
    const monthStart = `${today.slice(0, 7)}-01`;

    const [
      allIncomeAgg,
      allExpensesAgg,
      allRentalAgg,
      allRentalPaidAgg,
      totalVehicles,
      activeVehicles,
      inactiveVehicles,
      maintenanceVehicles,
      workingTodayVehicleIds,
      todayWorkDocs,
      recentExpenseDocs,
      recentWorkDocs,
      recentPaymentDocs,
      dailySummary,
      weeklySummary,
      monthlySummary,
      trendWorkAgg,
      trendExpAgg,
      trendRentAgg,
    ] = await Promise.all([
      DailyWorkModel.aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$incomeReceived' } } },
      ]),
      ExpenseModel.aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      RentalObligationModel.aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$dailyRate' } } },
      ]),
      RentalPaymentModel.aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      VehicleModel.countDocuments(),
      VehicleModel.countDocuments({ status: 'Active' }),
      VehicleModel.countDocuments({ status: 'Inactive' }),
      VehicleModel.countDocuments({ status: 'Maintenance' }),
      DailyWorkModel.distinct('vehicleId', { workDate: today }),
      DailyWorkModel.find({ workDate: today })
        .populate('vehicleId', 'name plateNumber ownership dailyRentalAmount')
        .sort({ createdAt: -1 })
        .lean(),
      ExpenseModel.find()
        .populate('vehicleId', 'name plateNumber')
        .sort({ expenseDate: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      DailyWorkModel.find()
        .populate('vehicleId', 'name plateNumber')
        .sort({ workDate: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      RentalPaymentModel.find()
        .populate('vehicleId', 'name plateNumber')
        .sort({ paymentDate: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      computePeriodSummary(today, today),
      computePeriodSummary(weekStart, today),
      computePeriodSummary(monthStart, today),
      DailyWorkModel.aggregate<{ _id: string; income: number; trips: number; entries: number }>([
        { $match: { workDate: { $gte: weekStart, $lte: today } } },
        {
          $group: {
            _id: '$workDate',
            income: { $sum: '$incomeReceived' },
            trips: { $sum: '$tripsCount' },
            entries: { $sum: 1 },
          },
        },
      ]),
      ExpenseModel.aggregate<{ _id: string; expenses: number }>([
        { $match: { expenseDate: { $gte: weekStart, $lte: today } } },
        { $group: { _id: '$expenseDate', expenses: { $sum: '$amount' } } },
      ]),
      RentalObligationModel.aggregate<{ _id: string; rental: number }>([
        { $match: { workDate: { $gte: weekStart, $lte: today } } },
        { $group: { _id: '$workDate', rental: { $sum: '$dailyRate' } } },
      ]),
    ]);

    const totalIncome = Math.round((allIncomeAgg[0]?.total ?? 0) * 100) / 100;
    const totalExpenses = Math.round((allExpensesAgg[0]?.total ?? 0) * 100) / 100;
    const totalVehicleRental = Math.round((allRentalAgg[0]?.total ?? 0) * 100) / 100;
    const netBalance = Math.round((totalIncome - totalExpenses - totalVehicleRental) * 100) / 100;
    const totalRentalPaid = Math.round((allRentalPaidAgg[0]?.total ?? 0) * 100) / 100;
    const outstandingRentalBalance = Math.round((totalVehicleRental - totalRentalPaid) * 100) / 100;

    const vehiclesWorkingToday = workingTodayVehicleIds.length;
    const vehiclesNotWorking = Math.max(0, totalVehicles - vehiclesWorkingToday);

    const todayWorkRecords = todayWorkDocs.map((dw) => {
      const veh = dw.vehicleId as unknown as {
        _id: { toString(): string };
        name: string;
        plateNumber: string;
        ownership: string;
        dailyRentalAmount: number;
      } | null;
      return {
        id: dw._id.toString(),
        work_date: dw.workDate,
        vehicle_id: veh?._id?.toString?.() ?? String(dw.vehicleId),
        vehicle_name: veh?.name ?? 'Unknown Vehicle',
        plate_number: veh?.plateNumber ?? '',
        ownership: veh?.ownership ?? 'company',
        daily_rental_amount: veh?.dailyRentalAmount ?? 0,
        driver_name: dw.driverName,
        cargo_description: dw.cargoDescription,
        destination: dw.destination,
        trips_count: dw.tripsCount,
        income_received: Math.round(dw.incomeReceived * 100) / 100,
        notes: dw.notes || '',
        created_at: dw.createdAt.toISOString(),
        updated_at: dw.updatedAt.toISOString(),
      };
    });

    const recentExpenses = recentExpenseDocs.map((exp) => {
      const veh = exp.vehicleId as unknown as {
        _id: { toString(): string };
        name: string;
        plateNumber: string;
      } | null;
      return {
        id: exp._id.toString(),
        expense_date: exp.expenseDate,
        vehicle_id: veh?._id?.toString?.() ?? String(exp.vehicleId),
        vehicle_name: veh?.name ?? 'Unknown Vehicle',
        plate_number: veh?.plateNumber ?? '',
        category: exp.category,
        description: exp.description,
        amount: Math.round(exp.amount * 100) / 100,
        created_at: exp.createdAt.toISOString(),
      };
    });

    const recentActivities = [
      ...recentWorkDocs.map((dw) => {
        const veh = dw.vehicleId as unknown as { name?: string; plateNumber?: string } | null;
        return {
          id: `work-${dw._id.toString()}`,
          type: 'work' as const,
          date: dw.workDate,
          vehicle_name: veh?.name ?? 'Unknown Vehicle',
          plate_number: veh?.plateNumber ?? '',
          title: `${dw.cargoDescription} → ${dw.destination}`,
          subtitle: `${dw.driverName} · ${dw.tripsCount}`,
          trips_count: dw.tripsCount,
          category: null,
          amount: Math.round(dw.incomeReceived * 100) / 100,
          created_at: dw.createdAt.toISOString(),
        };
      }),
      ...recentExpenseDocs.map((exp) => {
        const veh = exp.vehicleId as unknown as { name?: string; plateNumber?: string } | null;
        return {
          id: `exp-${exp._id.toString()}`,
          type: 'expense' as const,
          date: exp.expenseDate,
          vehicle_name: veh?.name ?? 'Unknown Vehicle',
          plate_number: veh?.plateNumber ?? '',
          title: exp.description,
          subtitle: exp.category,
          trips_count: null,
          category: exp.category,
          amount: Math.round(exp.amount * 100) / 100,
          created_at: exp.createdAt.toISOString(),
        };
      }),
      ...recentPaymentDocs.map((pay) => {
        const veh = pay.vehicleId as unknown as { name?: string; plateNumber?: string } | null;
        return {
          id: `pay-${pay._id.toString()}`,
          type: 'rental_payment' as const,
          date: pay.paymentDate,
          vehicle_name: veh?.name ?? 'Unknown Vehicle',
          plate_number: veh?.plateNumber ?? '',
          title: pay.notes || pay.paymentMethod,
          subtitle: pay.paymentMethod,
          trips_count: null,
          category: null,
          amount: Math.round(pay.amountPaid * 100) / 100,
          created_at: pay.createdAt.toISOString(),
        };
      }),
    ]
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
      .slice(0, 8);

    const trendWorkMap = new Map(trendWorkAgg.map((w) => [w._id, w]));
    const trendExpMap = new Map(trendExpAgg.map((e) => [e._id, e.expenses]));
    const trendRentMap = new Map(trendRentAgg.map((r) => [r._id, r.rental]));

    const dailyTrend = Array.from({ length: 7 }, (_, idx) => {
      const dateStr = shiftDate(today, idx - 6);
      const w = trendWorkMap.get(dateStr);
      const income = Math.round((w?.income ?? 0) * 100) / 100;
      const expenses = Math.round((trendExpMap.get(dateStr) ?? 0) * 100) / 100;
      const rental = Math.round((trendRentMap.get(dateStr) ?? 0) * 100) / 100;
      const net = Math.round((income - expenses - rental) * 100) / 100;

      return {
        date: dateStr,
        startDate: dateStr,
        endDate: dateStr,
        income,
        expenses,
        rental,
        netBalance: net,
        trips: w?.trips ?? 0,
        entries: w?.entries ?? 0,
      };
    });

    const currentDate = getTodayIsoDate();
    const currentMonthKey = currentDate.slice(0, 7);
    const currentMonthStart = `${currentMonthKey}-01`;
    const currentMonthEnd = `${currentMonthKey}-31`;

    const [
      currentMonthSummary,
      currentMonthPaidAgg,
      currentMonthExpByCatAgg,
      currentMonthVehicles,
      currentMonthWorkByVehAgg,
      currentMonthExpByVehAgg,
      currentMonthRentByVehAgg,
    ] = await Promise.all([
      computePeriodSummary(currentMonthStart, currentMonthEnd),
      RentalPaymentModel.aggregate<{ total: number }>([
        { $match: { paymentDate: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      ExpenseModel.aggregate<{ _id: string; count: number; total: number }>([
        { $match: { expenseDate: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { total: -1 } },
      ]),
      VehicleModel.find().sort({ name: 1 }).lean(),
      DailyWorkModel.aggregate<{ _id: unknown; income: number; trips: number }>([
        { $match: { workDate: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
        {
          $group: {
            _id: '$vehicleId',
            income: { $sum: '$incomeReceived' },
            trips: { $sum: '$tripsCount' },
          },
        },
      ]),
      ExpenseModel.aggregate<{ _id: unknown; expenses: number }>([
        { $match: { expenseDate: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
        { $group: { _id: '$vehicleId', expenses: { $sum: '$amount' } } },
      ]),
      RentalObligationModel.aggregate<{ _id: unknown; rental: number; workingDays: number }>([
        { $match: { workDate: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
        {
          $group: {
            _id: '$vehicleId',
            rental: { $sum: '$dailyRate' },
            workingDays: { $sum: 1 },
          },
        },
      ]),
    ]);

    const workByVehMap = new Map(currentMonthWorkByVehAgg.map((r) => [String(r._id), r]));
    const expByVehMap = new Map(currentMonthExpByVehAgg.map((r) => [String(r._id), r.expenses]));
    const rentByVehMap = new Map(currentMonthRentByVehAgg.map((r) => [String(r._id), r]));

    const vehicleBreakdown = currentMonthVehicles
      .map((v) => {
        const vid = v._id.toString();
        const w = workByVehMap.get(vid);
        const exp = Math.round((expByVehMap.get(vid) ?? 0) * 100) / 100;
        const rent = rentByVehMap.get(vid);
        const income = Math.round((w?.income ?? 0) * 100) / 100;
        const rental = Math.round((rent?.rental ?? 0) * 100) / 100;
        const net = Math.round((income - exp - rental) * 100) / 100;
        return {
          vehicle_id: vid,
          vehicle_name: v.name,
          plate_number: v.plateNumber,
          ownership: v.ownership,
          working_days: rent?.workingDays ?? 0,
          trips: w?.trips ?? 0,
          income,
          expenses: exp,
          rental,
          net_balance: net,
        };
      })
      .filter((row) => row.trips > 0 || row.income > 0 || row.expenses > 0 || row.rental > 0);

    const expensesByCategory = currentMonthExpByCatAgg.map((row) => ({
      category: row._id,
      count: row.count,
      total: Math.round(row.total * 100) / 100,
    }));

    const monthlyOverview = {
      monthKey: currentMonthKey,
      startDate: currentMonthStart,
      endDate: currentDate,
      income: currentMonthSummary.income,
      expenses: currentMonthSummary.expenses,
      rental: currentMonthSummary.rental,
      rentalPaid: Math.round((currentMonthPaidAgg[0]?.total ?? 0) * 100) / 100,
      netBalance: currentMonthSummary.netBalance,
      trips: currentMonthSummary.trips,
      entries: currentMonthSummary.entries,
      expensesByCategory,
      vehicleBreakdown,
    };

    res.json({
      today,
      financials: {
        totalIncome,
        totalExpenses,
        totalVehicleRental,
        netBalance,
        totalRentalPaid,
        outstandingRentalBalance,
      },
      fleet: {
        totalVehicles,
        vehiclesWorkingToday,
        vehiclesNotWorking,
        activeVehicles,
        inactiveVehicles,
        maintenanceVehicles,
      },
      todayWorkRecords,
      recentExpenses,
      recentActivities,
      summaries: {
        daily: dailySummary,
        weekly: weeklySummary,
        monthly: monthlySummary,
      },
      monthlyOverview,
      dailyTrend,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
