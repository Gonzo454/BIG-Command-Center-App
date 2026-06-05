"use client";

const PRINCIPAL = 1_300_000;
const ANNUAL_RATE = 0.10;
const LOAN_START = new Date("2025-08-01T00:00:00Z");
const PAYMENT_START = new Date("2027-08-01T00:00:00Z");

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtDec = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function computeAccruedInterest(asOf: Date): {
  daysSinceLoan: number;
  monthsElapsed: number;
  dailyRate: number;
  monthlyAccrual: number;
  accruedInterest: number;
  totalReceivable: number;
  monthsUntilPayments: number;
  projectedInterestAtPaymentStart: number;
  schedule: { month: string; accruedBOL: number; monthAccrual: number; accruedEOL: number }[];
} {
  const dailyRate = ANNUAL_RATE / 365;
  const monthlyAccrual = PRINCIPAL * (ANNUAL_RATE / 12);

  const daysSinceLoan = Math.max(0, Math.floor((asOf.getTime() - LOAN_START.getTime()) / (1000 * 60 * 60 * 24)));
  const accruedInterest = PRINCIPAL * dailyRate * daysSinceLoan;
  const totalReceivable = PRINCIPAL + accruedInterest;

  const monthsUntilPayments = Math.max(0,
    (PAYMENT_START.getFullYear() - asOf.getFullYear()) * 12 + (PAYMENT_START.getMonth() - asOf.getMonth())
  );

  const totalDaysToPayment = Math.floor((PAYMENT_START.getTime() - LOAN_START.getTime()) / (1000 * 60 * 60 * 24));
  const projectedInterestAtPaymentStart = PRINCIPAL * dailyRate * totalDaysToPayment;

  // Monthly accrual schedule from loan start to payment start
  const schedule: { month: string; accruedBOL: number; monthAccrual: number; accruedEOL: number }[] = [];
  const cursor = new Date(LOAN_START);
  let running = 0;
  while (cursor < PAYMENT_START) {
    const yr = cursor.getFullYear();
    const mo = cursor.getMonth();
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    const monthInterest = PRINCIPAL * dailyRate * daysInMonth;
    const row = {
      month: cursor.toLocaleDateString("en-US", { year: "numeric", month: "short" }),
      accruedBOL: running,
      monthAccrual: monthInterest,
      accruedEOL: running + monthInterest,
    };
    schedule.push(row);
    running += monthInterest;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const monthsElapsed = Math.max(0,
    (asOf.getFullYear() - LOAN_START.getFullYear()) * 12 + (asOf.getMonth() - LOAN_START.getMonth())
  );

  return {
    daysSinceLoan,
    monthsElapsed,
    dailyRate,
    monthlyAccrual,
    accruedInterest,
    totalReceivable,
    monthsUntilPayments,
    projectedInterestAtPaymentStart,
    schedule,
  };
}

export default function Station955Page() {
  const now = new Date();
  const data = computeAccruedInterest(now);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Station 955 Loan</h1>
        <p className="text-sm text-gray-500 mt-1">
          Note receivable &middot; $1.3M at 10% &middot; Interest accruing &middot; Payments start Aug 2027
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Principal" value={fmtK(PRINCIPAL)} />
        <MetricCard
          label="Accrued Interest"
          value={fmtK(data.accruedInterest)}
          sub={`${data.daysSinceLoan} days @ ${(data.dailyRate * 100).toFixed(4)}%/day`}
          color="text-amber-600"
        />
        <MetricCard
          label="Total Receivable"
          value={fmtK(data.totalReceivable)}
          sub="Principal + accrued interest"
          color="text-emerald-600"
        />
        <MetricCard
          label="Payments Begin"
          value={`${data.monthsUntilPayments} mo`}
          sub="August 1, 2027"
          color={data.monthsUntilPayments <= 6 ? "text-amber-600" : undefined}
        />
      </div>

      {/* Loan Details */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Loan Terms</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Borrower</p>
            <p className="font-medium text-gray-900 dark:text-white">Station 955</p>
          </div>
          <div>
            <p className="text-gray-500">Lender</p>
            <p className="font-medium text-gray-900 dark:text-white">Joe Wagner</p>
          </div>
          <div>
            <p className="text-gray-500">Principal Amount</p>
            <p className="font-medium text-gray-900 dark:text-white">{fmtDec(PRINCIPAL)}</p>
          </div>
          <div>
            <p className="text-gray-500">Annual Interest Rate</p>
            <p className="font-medium text-gray-900 dark:text-white">10.0%</p>
          </div>
          <div>
            <p className="text-gray-500">Loan Commencement</p>
            <p className="font-medium text-gray-900 dark:text-white">August 1, 2025</p>
          </div>
          <div>
            <p className="text-gray-500">Payment Start Date</p>
            <p className="font-medium text-gray-900 dark:text-white">August 1, 2027 (24-month deferral)</p>
          </div>
          <div>
            <p className="text-gray-500">Monthly Accrual</p>
            <p className="font-medium text-amber-600">{fmtDec(data.monthlyAccrual)}/mo</p>
          </div>
          <div>
            <p className="text-gray-500">Projected Interest at Payment Start</p>
            <p className="font-medium text-amber-600">{fmtDec(data.projectedInterestAtPaymentStart)}</p>
          </div>
        </div>
      </div>

      {/* Interest Accrual Schedule */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Interest Accrual Schedule</h2>
          <p className="text-xs text-gray-500 mt-0.5">Monthly accrual from loan start through payment start</p>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 dark:bg-gray-700 text-xs uppercase sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Month</th>
                <th className="text-right px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Accrued (Start)</th>
                <th className="text-right px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Month Interest</th>
                <th className="text-right px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Accrued (End)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.schedule.map((row, i) => {
                const isPast = i < data.monthsElapsed;
                const isCurrent = i === data.monthsElapsed;
                return (
                  <tr
                    key={row.month}
                    className={
                      isCurrent
                        ? "bg-amber-50 dark:bg-amber-900/20 font-semibold"
                        : isPast
                          ? "text-gray-500"
                          : "hover:bg-gray-50 dark:hover:bg-gray-750"
                    }
                  >
                    <td className="px-4 py-2">
                      {row.month}
                      {isCurrent && <span className="ml-2 text-xs text-amber-600">← current</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{fmtDec(row.accruedBOL)}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-600">{fmtDec(row.monthAccrual)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtDec(row.accruedEOL)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || "text-gray-900 dark:text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
