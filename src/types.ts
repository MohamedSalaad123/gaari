export type Language = 'so' | 'en';

export type NavSection =
  | 'dashboard'
  | 'vehicles'
  | 'daily-work'
  | 'expenses'
  | 'rental-payments'
  | 'reports'
  | 'settings';

export type VehicleOwnership = 'company' | 'rented';
export type VehicleStatus = 'Active' | 'Inactive' | 'Maintenance';

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

export type ReportType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'vehicle_income'
  | 'expense'
  | 'rental_payment';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

export interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  dbConfigured?: boolean;
  dbConnected?: boolean;
  dbError?: string | null;
}

export interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  vehicle_type: string;
  driver_name: string;
  driver_phone: string;
  ownership: VehicleOwnership;
  daily_rental_amount: number;
  status: VehicleStatus;
  created_at: string;
  updated_at: string;
  total_trips?: number;
  total_income?: number;
  working_days?: number;
}

export interface DailyWorkRecord {
  id: string;
  work_date: string;
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  ownership: VehicleOwnership;
  daily_rental_amount?: number;
  driver_name: string;
  cargo_description: string;
  destination: string;
  trips_count: number;
  income_received: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRecord {
  id: string;
  expense_date: string;
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  created_at: string;
}

export interface RentalVehicleSummary {
  vehicle_id: string;
  name: string;
  plate_number: string;
  vehicle_type: string;
  driver_name: string;
  daily_rental_amount: number;
  status: VehicleStatus;
  working_days: number;
  total_rental_due: number;
  amount_paid: number;
  outstanding_balance: number;
}

export interface RentalObligationRow {
  id: string;
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  work_date: string;
  daily_rate: number;
  trips_count: number;
}

export interface RentalPaymentRow {
  id: string;
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface PeriodSummary {
  startDate: string;
  endDate: string;
  income: number;
  expenses: number;
  rental: number;
  netBalance: number;
  trips: number;
  entries: number;
}

export interface ActivityItem {
  id: string;
  type: 'work' | 'expense' | 'rental_payment';
  date: string;
  vehicle_name: string;
  plate_number: string;
  title: string;
  subtitle: string;
  trips_count: number | null;
  category: ExpenseCategory | null;
  amount: number;
  created_at: string;
}

export interface MonthlyExpenseCategoryRow {
  category: ExpenseCategory;
  count: number;
  total: number;
}

export interface MonthlyVehicleBreakdownRow {
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  ownership: VehicleOwnership;
  working_days: number;
  trips: number;
  income: number;
  expenses: number;
  rental: number;
  net_balance: number;
}

export interface MonthlyOverview {
  monthKey: string;
  startDate: string;
  endDate: string;
  income: number;
  expenses: number;
  rental: number;
  rentalPaid: number;
  netBalance: number;
  trips: number;
  entries: number;
  expensesByCategory: MonthlyExpenseCategoryRow[];
  vehicleBreakdown: MonthlyVehicleBreakdownRow[];
}

export interface DashboardData {
  today: string;
  financials: {
    totalIncome: number;
    totalExpenses: number;
    totalVehicleRental: number;
    netBalance: number;
    totalRentalPaid: number;
    outstandingRentalBalance: number;
  };
  fleet: {
    totalVehicles: number;
    vehiclesWorkingToday: number;
    vehiclesNotWorking: number;
    activeVehicles: number;
    inactiveVehicles: number;
    maintenanceVehicles: number;
  };
  todayWorkRecords: DailyWorkRecord[];
  recentExpenses: ExpenseRecord[];
  recentActivities: ActivityItem[];
  summaries: {
    daily: PeriodSummary;
    weekly: PeriodSummary;
    monthly: PeriodSummary;
  };
  monthlyOverview: MonthlyOverview;
  dailyTrend: Array<PeriodSummary & { date: string }>;
}

export interface ReportData {
  type: ReportType;
  startDate: string;
  endDate: string;
  vehicleId: string | null;
  summary: {
    totalIncome: number;
    totalExpenses: number;
    totalRental: number;
    netBalance: number;
  };
  rows: Array<Record<string, unknown>>;
}

export interface BackupInfo {
  provider: string;
  dbName: string;
  connected: boolean;
  lastChecked: string;
  counts: {
    vehicles: number;
    dailyWorks: number;
    expenses: number;
    rentalObligations: number;
    rentalPayments: number;
  };
}

export type NotificationType = 'vehicle_maintenance' | 'rental_payment';

export interface AppNotification {
  id: string;
  type: NotificationType;
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  amount: number | null;
  payment_method: string | null;
  payment_date: string | null;
  read: boolean;
  created_at: string;
}
