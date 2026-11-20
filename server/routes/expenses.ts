import { Router } from 'express';
import { EXPENSE_CATEGORIES, ExpenseModel, VehicleModel } from '../db.ts';
import { AppError, requireAuth } from '../security.ts';
import {
  escapeRegex,
  requireDateString,
  requireEnum,
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

function serializeExpense(
  exp: {
    _id: { toString(): string };
    expenseDate: string;
    vehicleId: PopulatedVehicle | { toString(): string };
    category: string;
    description: string;
    amount: number;
    createdAt: Date;
  },
  fallbackVehicle?: PopulatedVehicle
) {
  const veh =
    fallbackVehicle ||
    (typeof exp.vehicleId === 'object' && 'plateNumber' in exp.vehicleId ? exp.vehicleId : null);

  return {
    id: exp._id.toString(),
    expense_date: exp.expenseDate,
    vehicle_id: veh ? veh._id.toString() : exp.vehicleId.toString(),
    vehicle_name: veh ? veh.name : 'Unknown Vehicle',
    plate_number: veh ? veh.plateNumber : '',
    category: exp.category,
    description: exp.description,
    amount: Math.round(exp.amount * 100) / 100,
    created_at: exp.createdAt.toISOString(),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { startDate, endDate, vehicleId, category, search } = req.query;
    const filter: Record<string, unknown> = {};

    if (typeof startDate === 'string' && startDate.trim()) {
      filter.expenseDate = {
        ...(filter.expenseDate as object),
        $gte: requireDateString(startDate, 'Start date'),
      };
    }
    if (typeof endDate === 'string' && endDate.trim()) {
      filter.expenseDate = {
        ...(filter.expenseDate as object),
        $lte: requireDateString(endDate, 'End date'),
      };
    }
    if (typeof vehicleId === 'string' && vehicleId.trim() && vehicleId !== 'all') {
      filter.vehicleId = requireObjectId(vehicleId, 'Vehicle ID');
    }
    if (typeof category === 'string' && category.trim() && category !== 'all') {
      filter.category = requireEnum(category, EXPENSE_CATEGORIES, 'Expense category');
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
        { description: rx },
        ...(matchedVehicleIds.length > 0 ? [{ vehicleId: { $in: matchedVehicleIds } }] : []),
      ];
    }

    const docs = await ExpenseModel.find(filter)
      .populate('vehicleId', 'name plateNumber')
      .sort({ expenseDate: -1, createdAt: -1 })
      .lean();

    const expenses = docs.map((doc) =>
      serializeExpense(doc as unknown as Parameters<typeof serializeExpense>[0])
    );

    res.json({ expenses });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const expenseDate = requireDateString(req.body?.expense_date, 'Expense date');
    const vehicleId = requireObjectId(req.body?.vehicle_id, 'Vehicle');
    const category = requireEnum(req.body?.category, EXPENSE_CATEGORIES, 'Expense category');
    const description = requireNonEmptyString(req.body?.description, 'Description', 250);
    const amount = requirePositiveNumber(req.body?.amount, 'Expense amount (USD)');
    const clientRequestId =
      typeof req.body?.client_request_id === 'string' && req.body.client_request_id.trim()
        ? req.body.client_request_id.trim().slice(0, 100)
        : undefined;

    if (clientRequestId) {
      const duplicate = await ExpenseModel.findOne({ clientRequestId })
        .populate('vehicleId', 'name plateNumber')
        .lean();
      if (duplicate) {
        res.status(200).json({
          expense: serializeExpense(duplicate as unknown as Parameters<typeof serializeExpense>[0]),
          deduplicated: true,
        });
        return;
      }
    }

    const vehicle = await VehicleModel.findById(vehicleId).select('name plateNumber').lean();
    if (!vehicle) {
      throw new AppError('Selected vehicle was not found.', 404, 'VEHICLE_NOT_FOUND');
    }

    const created = await ExpenseModel.create({
      expenseDate,
      vehicleId,
      category,
      description,
      amount,
      ...(clientRequestId ? { clientRequestId } : {}),
    });

    res.status(201).json({
      expense: serializeExpense(created, vehicle as unknown as PopulatedVehicle),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Expense ID');
    const existing = await ExpenseModel.findById(id);
    if (!existing) {
      throw new AppError('Expense record not found.', 404, 'NOT_FOUND');
    }

    const expenseDate = requireDateString(req.body?.expense_date, 'Expense date');
    const vehicleId = requireObjectId(req.body?.vehicle_id, 'Vehicle');
    const category = requireEnum(req.body?.category, EXPENSE_CATEGORIES, 'Expense category');
    const description = requireNonEmptyString(req.body?.description, 'Description', 250);
    const amount = requirePositiveNumber(req.body?.amount, 'Expense amount (USD)');

    const vehicle = await VehicleModel.findById(vehicleId).select('name plateNumber').lean();
    if (!vehicle) {
      throw new AppError('Selected vehicle was not found.', 404, 'VEHICLE_NOT_FOUND');
    }

    existing.expenseDate = expenseDate;
    existing.vehicleId = vehicleId;
    existing.category = category;
    existing.description = description;
    existing.amount = amount;
    await existing.save();

    res.json({
      expense: serializeExpense(existing, vehicle as unknown as PopulatedVehicle),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = requireObjectId(req.params.id, 'Expense ID');
    const deleted = await ExpenseModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new AppError('Expense record not found.', 404, 'NOT_FOUND');
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
