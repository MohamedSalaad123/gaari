import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Language, ReportData, ReportType } from '../types';
import { formatUSD } from './api';

export const REPORT_LABELS_BY_LANG: Record<Language, Record<ReportType, string>> = {
  so: {
    daily: 'Warbixinta Shaqada Maalinlaha',
    weekly: 'Warbixinta Shaqada Toddobaadlaha',
    monthly: 'Warbixinta Shaqada Bisha',
    vehicle_income: 'Warbixinta Dakhliga & Waxqabadka Gaadiidka',
    expense: 'Warbixinta Kharashaadka Gaadiidka',
    rental_payment: 'Warbixinta Kirada & Bixinta Gaadiidka',
  },
  en: {
    daily: 'Daily Operations Report',
    weekly: 'Weekly Operations Report',
    monthly: 'Monthly Operations Report',
    vehicle_income: 'Vehicle Income & Performance Report',
    expense: 'Vehicle Expense Report',
    rental_payment: 'Vehicle Rental Payment Report',
  },
};

const CATEGORY_LABELS_SO: Record<string, string> = {
  Fuel: 'Shidaal (Fuel)',
  Food: 'Cunto (Food)',
  Maintenance: 'Dayactir (Maintenance)',
  'Road fees': 'Khidmadda Waddooyinka',
  'Loading and unloading': 'Raridda & Dejinta',
  'Driver allowance': 'Gunnada Darawalka',
  'Other expenses': 'Kharashaad Kale',
};

export interface ReportTableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: 'currency' | 'number' | 'ownership' | 'category';
}

export function getColumnsForReport(type: ReportType, lang: Language = 'en'): ReportTableColumn[] {
  const isSo = lang === 'so';
  switch (type) {
    case 'daily':
    case 'weekly':
    case 'monthly':
      return [
        {
          key: 'period',
          label:
            type === 'daily'
              ? isSo
                ? 'Taariikhda'
                : 'Date'
              : type === 'weekly'
              ? isSo
                ? 'Toddobaadka'
                : 'Week'
              : isSo
              ? 'Bisha'
              : 'Month',
        },
        {
          key: 'vehicles_worked',
          label: isSo ? 'Gaadiidka Shaqeeyay' : 'Vehicles Worked',
          align: 'right',
          format: 'number',
        },
        { key: 'trips', label: isSo ? 'Safarro' : 'Trips', align: 'right', format: 'number' },
        { key: 'income', label: isSo ? 'Dakhli' : 'Income', align: 'right', format: 'currency' },
        {
          key: 'expenses',
          label: isSo ? 'Kharash' : 'Expenses',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'rental',
          label: isSo ? 'Kiro' : 'Rental Due',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'net_balance',
          label: isSo ? 'Haraaga Saafiga' : 'Net Balance',
          align: 'right',
          format: 'currency',
        },
      ];
    case 'vehicle_income':
      return [
        { key: 'vehicle_name', label: isSo ? 'Gaariga' : 'Vehicle' },
        { key: 'plate_number', label: isSo ? 'Taargada' : 'Plate' },
        {
          key: 'ownership',
          label: isSo ? 'Milkiyadda' : 'Ownership',
          format: 'ownership',
        },
        {
          key: 'working_days',
          label: isSo ? 'Maalmaha Shaqada' : 'Working Days',
          align: 'right',
          format: 'number',
        },
        { key: 'trips', label: isSo ? 'Safarro' : 'Trips', align: 'right', format: 'number' },
        { key: 'income', label: isSo ? 'Dakhli' : 'Income', align: 'right', format: 'currency' },
        {
          key: 'expenses',
          label: isSo ? 'Kharash' : 'Expenses',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'rental',
          label: isSo ? 'Kiro' : 'Rental Due',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'net_balance',
          label: isSo ? 'Haraaga Saafiga' : 'Net Balance',
          align: 'right',
          format: 'currency',
        },
      ];
    case 'expense':
      return [
        { key: 'expense_date', label: isSo ? 'Taariikhda' : 'Date' },
        { key: 'vehicle_name', label: isSo ? 'Gaariga' : 'Vehicle' },
        { key: 'plate_number', label: isSo ? 'Taargada' : 'Plate' },
        { key: 'category', label: isSo ? 'Qaybta' : 'Category', format: 'category' },
        { key: 'description', label: isSo ? 'Sharaxaadda' : 'Description' },
        {
          key: 'amount',
          label: isSo ? 'Qiimaha (USD)' : 'Amount (USD)',
          align: 'right',
          format: 'currency',
        },
      ];
    case 'rental_payment':
      return [
        { key: 'vehicle_name', label: isSo ? 'Gaariga' : 'Vehicle' },
        { key: 'plate_number', label: isSo ? 'Taargada' : 'Plate' },
        {
          key: 'daily_rental_amount',
          label: isSo ? 'Kirada Maalintii' : 'Daily Rate',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'working_days',
          label: isSo ? 'Maalmaha Shaqada' : 'Working Days',
          align: 'right',
          format: 'number',
        },
        {
          key: 'total_due',
          label: isSo ? 'Wadarta Kirada' : 'Total Rental Due',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'amount_paid',
          label: isSo ? 'La Bixiyay' : 'Amount Paid',
          align: 'right',
          format: 'currency',
        },
        {
          key: 'outstanding_balance',
          label: isSo ? 'Haraaga Hadhsan' : 'Remaining Balance',
          align: 'right',
          format: 'currency',
        },
      ];
  }
}

export function formatCellValue(
  value: unknown,
  col: ReportTableColumn,
  lang: Language = 'en'
): string {
  if (value === null || value === undefined) return '';
  if (col.format === 'currency') return formatUSD(Number(value));
  if (col.format === 'number') return String(Number(value));
  if (col.format === 'ownership') {
    if (lang === 'so') return value === 'rented' ? 'Kiro ah' : 'Shirkadda Leh';
    return value === 'rented' ? 'Rented' : 'Company-owned';
  }
  if (col.format === 'category') {
    const raw = String(value);
    if (lang === 'so') return CATEGORY_LABELS_SO[raw] ?? raw;
    return raw;
  }
  return String(value);
}

export function exportReportToPDF(
  report: ReportData,
  vehicleFilterLabel: string,
  lang: Language = 'so'
): void {
  const isSo = lang === 'so';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const title = REPORT_LABELS_BY_LANG[lang][report.type];
  const columns = getColumnsForReport(report.type, lang);

  doc.setFillColor(11, 22, 44);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 68, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(
    isSo
      ? 'HaulLedger — Nidaamka Maamulka Gaadiidka Xamuulka'
      : 'HaulLedger — Daily Truck Management System',
    40,
    30
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    isSo
      ? `${title}  |  Muddada: ${report.startDate} ilaa ${report.endDate}  |  Gaariga: ${vehicleFilterLabel}`
      : `${title}  |  Period: ${report.startDate} to ${report.endDate}  |  Vehicle: ${vehicleFilterLabel}`,
    40,
    50
  );

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(
    isSo
      ? `Dakhliga Guud: ${formatUSD(report.summary.totalIncome)}     Kharashaadka: ${formatUSD(
          report.summary.totalExpenses
        )}     Kirada: ${formatUSD(report.summary.totalRental)}     Haraaga Saafiga: ${formatUSD(
          report.summary.netBalance
        )}`
      : `Total Income: ${formatUSD(report.summary.totalIncome)}     Total Expenses: ${formatUSD(
          report.summary.totalExpenses
        )}     Total Rental: ${formatUSD(report.summary.totalRental)}     Net Balance: ${formatUSD(
          report.summary.netBalance
        )}`,
    40,
    92
  );

  const head = [columns.map((c) => c.label)];
  const body = report.rows.map((row) =>
    columns.map((col) => formatCellValue(row[col.key], col, lang))
  );

  autoTable(doc, {
    startY: 108,
    head,
    body,
    styles: {
      fontSize: 9,
      cellPadding: 6,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [29, 78, 137],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: columns.reduce<Record<number, { halign: 'left' | 'right' }>>((acc, col, idx) => {
      acc[idx] = { halign: col.align === 'right' ? 'right' : 'left' };
      return acc;
    }, {}),
  });

  doc.save(`haulledger_${report.type}_${report.startDate}_to_${report.endDate}.pdf`);
}

export function exportReportToExcel(
  report: ReportData,
  vehicleFilterLabel: string,
  lang: Language = 'so'
): void {
  const isSo = lang === 'so';
  const columns = getColumnsForReport(report.type, lang);
  const title = REPORT_LABELS_BY_LANG[lang][report.type];

  const summaryRows = [
    [
      isSo
        ? 'HaulLedger — Nidaamka Maamulka Gaadiidka Xamuulka'
        : 'HaulLedger — Daily Truck Management System',
    ],
    [title],
    [
      isSo ? 'Muddada' : 'Period',
      `${report.startDate} ${isSo ? 'ilaa' : 'to'} ${report.endDate}`,
    ],
    [isSo ? 'Gaariga' : 'Vehicle Filter', vehicleFilterLabel],
    [],
    [isSo ? 'Xogta Guud' : 'Summary Metric', isSo ? 'Qiimaha (USD)' : 'Amount (USD)'],
    [isSo ? 'Dakhliga Guud' : 'Total Income', report.summary.totalIncome],
    [isSo ? 'Kharashaadka Guud' : 'Total Expenses', report.summary.totalExpenses],
    [isSo ? 'Kirada Guud' : 'Total Vehicle Rental', report.summary.totalRental],
    [isSo ? 'Haraaga Saafiga ah' : 'Net Balance', report.summary.netBalance],
  ];

  const detailHeader = columns.map((c) => c.label);
  const detailRows = report.rows.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      if (col.format === 'currency' || col.format === 'number') {
        return Number(val ?? 0);
      }
      if (col.format === 'ownership') {
        if (isSo) return val === 'rented' ? 'Kiro ah' : 'Shirkadda Leh';
        return val === 'rented' ? 'Rented' : 'Company-owned';
      }
      if (col.format === 'category') {
        const raw = String(val ?? '');
        return isSo ? CATEGORY_LABELS_SO[raw] ?? raw : raw;
      }
      return val ?? '';
    })
  );

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  const wsDetails = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);

  XLSX.utils.book_append_sheet(wb, wsDetails, isSo ? 'Xogta Warbixinta' : 'Report Data');
  XLSX.utils.book_append_sheet(wb, wsSummary, isSo ? 'Guudmarka' : 'Financial Summary');

  XLSX.writeFile(wb, `haulledger_${report.type}_${report.startDate}_to_${report.endDate}.xlsx`);
}
