"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePlaidLink } from "react-plaid-link";
import { ExportButtons } from "@/components/ExportButtons";

interface AccountBalance {
  available: number | null;
  current: number | null;
  limit: number | null;
  currency: string;
}

interface Account {
  id: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  balances: AccountBalance;
}

interface Transaction {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  currency: string;
  category: string;
  pending: boolean;
  accountId: string;
}

interface ConnectedInstitution {
  name: string;
  accessToken: string;
  accounts: Account[];
  transactions: Transaction[];
}

const fmt = (n: number | null) =>
  n !== null
    ? "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  depository: "🏦",
  credit: "💳",
  loan: "🏠",
  investment: "📈",
  other: "💼",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  cd: "Certificate of Deposit",
  "money market": "Money Market",
  credit_card: "Credit Card",
  mortgage: "Mortgage",
  student: "Student Loan",
  auto: "Auto Loan",
  "line of credit": "Line of Credit",
};

interface PlaidSuccessMetadata {
  institution?: { name?: string; institution_id?: string } | null;
}

function PlaidLinkButton({ onSuccess }: { onSuccess: (publicToken: string, metadata: PlaidSuccessMetadata) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLinkToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setLinkToken(data.link_token);
      }
    } catch {
      setError("Failed to initialize Plaid Link");
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      onSuccess(publicToken, metadata);
      setLinkToken(null);
    },
  });

  return (
    <div>
      {error && (
        <p className="text-sm text-red-500 mb-2">{error}</p>
      )}
      {!linkToken ? (
        <button
          onClick={fetchLinkToken}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {loading ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <span>🏦</span>
          )}
          {loading ? "Connecting..." : "Connect Bank Account"}
        </button>
      ) : (
        <button
          onClick={() => open()}
          disabled={!ready}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          <span>🔗</span>
          Open Plaid Link
        </button>
      )}
    </div>
  );
}

export default function BankingPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [plaidEnv, setPlaidEnv] = useState<string>("sandbox");
  const [institutions, setInstitutions] = useState<ConnectedInstitution[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [activeTab, setActiveTab] = useState<"accounts" | "transactions">("accounts");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch("/api/plaid/status")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured);
        setPlaidEnv(d.environment);
      })
      .catch(() => setConfigured(false));

    const saved = localStorage.getItem("plaid_institutions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ConnectedInstitution[];
        setInstitutions(parsed);
        for (const inst of parsed) {
          refreshInstitution(inst.accessToken, inst.name);
        }
      } catch {
        localStorage.removeItem("plaid_institutions");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveInstitutions(insts: ConnectedInstitution[]) {
    setInstitutions(insts);
    localStorage.setItem("plaid_institutions", JSON.stringify(insts));
  }

  async function refreshInstitution(accessToken: string, name: string) {
    setLoadingAccounts(true);
    try {
      const [acctRes, txnRes] = await Promise.all([
        fetch("/api/plaid/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        }),
        fetch("/api/plaid/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        }),
      ]);

      const acctData = await acctRes.json();
      const txnData = await txnRes.json();

      setInstitutions((prev) => {
        const updated = prev.map((inst) =>
          inst.accessToken === accessToken
            ? { ...inst, accounts: acctData.accounts || [], transactions: txnData.transactions || [] }
            : inst
        );
        localStorage.setItem("plaid_institutions", JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error("Failed to refresh institution:", err);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function handlePlaidSuccess(publicToken: string, metadata: PlaidSuccessMetadata) {
    setLoadingAccounts(true);
    try {
      const exchangeRes = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution: metadata.institution?.name || "Unknown Institution",
        }),
      });

      const exchangeData = await exchangeRes.json();
      if (exchangeData.error) throw new Error(exchangeData.error);

      const newInst: ConnectedInstitution = {
        name: metadata.institution?.name || "Unknown Institution",
        accessToken: exchangeData.access_token,
        accounts: [],
        transactions: [],
      };

      const updated = [...institutions, newInst];
      saveInstitutions(updated);

      await refreshInstitution(exchangeData.access_token, newInst.name);
    } catch (err) {
      console.error("Plaid connection error:", err);
    } finally {
      setLoadingAccounts(false);
    }
  }

  function disconnectInstitution(accessToken: string) {
    const updated = institutions.filter((i) => i.accessToken !== accessToken);
    saveInstitutions(updated);
  }

  const allAccounts = institutions.flatMap((inst) =>
    inst.accounts.map((acct) => ({ ...acct, institution: inst.name }))
  );
  const allTransactions = institutions
    .flatMap((inst) =>
      inst.transactions.map((txn) => ({ ...txn, institution: inst.name }))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalBalances = {
    depository: allAccounts
      .filter((a) => a.type === "depository")
      .reduce((s, a) => s + (a.balances.current || 0), 0),
    credit: allAccounts
      .filter((a) => a.type === "credit")
      .reduce((s, a) => s + (a.balances.current || 0), 0),
    loan: allAccounts
      .filter((a) => a.type === "loan")
      .reduce((s, a) => s + (a.balances.current || 0), 0),
    investment: allAccounts
      .filter((a) => a.type === "investment")
      .reduce((s, a) => s + (a.balances.current || 0), 0),
  };

  const accountExportRows = allAccounts.map((a) => [
    a.institution,
    a.officialName || a.name,
    a.type,
    a.subtype || "",
    a.mask ? `****${a.mask}` : "",
    fmt(a.balances.current),
    fmt(a.balances.available),
  ]);

  const transactionExportRows = allTransactions.map((t) => [
    t.date,
    t.institution,
    t.name,
    t.category,
    t.amount > 0 ? fmt(t.amount) : "",
    t.amount < 0 ? fmt(Math.abs(t.amount)) : "",
    t.pending ? "Pending" : "Posted",
  ]);

  if (configured === null) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Banking</h1>
          <p className="text-sm text-gray-500 mt-1">
            {configured ? (
              <>Direct bank feeds via Plaid • {plaidEnv} environment</>
            ) : (
              "Plaid integration ready — add API keys to activate"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {allAccounts.length > 0 && (
            <ExportButtons
              fileName={activeTab === "accounts" ? "Bank_Accounts" : "Bank_Transactions"}
              title={activeTab === "accounts" ? "Bank Accounts" : "Bank Transactions"}
              headers={
                activeTab === "accounts"
                  ? ["Institution", "Account", "Type", "Subtype", "Mask", "Balance", "Available"]
                  : ["Date", "Institution", "Description", "Category", "Debit", "Credit", "Status"]
              }
              rows={activeTab === "accounts" ? accountExportRows : transactionExportRows}
            />
          )}
          {configured && <PlaidLinkButton onSuccess={handlePlaidSuccess} />}
        </div>
      </div>

      {!configured && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🏦</span>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white mb-2">Connect Your Bank Accounts</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Plaid integration is pre-wired and ready to go. Add your Plaid API credentials to Vercel
                to enable direct bank account connections for real-time balances and transactions.
              </p>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Setup Instructions:</p>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
                  <li>
                    Create a Plaid account at{" "}
                    <a href="https://dashboard.plaid.com/signup" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      dashboard.plaid.com
                    </a>
                  </li>
                  <li>Get your <strong>client_id</strong> and <strong>secret</strong> from the Plaid dashboard under Keys</li>
                  <li>
                    Add these environment variables to Vercel:
                    <div className="mt-1 font-mono text-xs bg-gray-100 dark:bg-gray-900 rounded p-2 space-y-1">
                      <div><span className="text-blue-600">PLAID_CLIENT_ID</span>=your_client_id</div>
                      <div><span className="text-blue-600">PLAID_SECRET</span>=your_secret</div>
                      <div><span className="text-blue-600">PLAID_ENV</span>=sandbox <span className="text-gray-400">(or development / production)</span></div>
                    </div>
                  </li>
                  <li>Redeploy the dashboard</li>
                </ol>
                <p className="text-xs text-gray-400 mt-3">
                  Use <strong>sandbox</strong> for testing with fake data, <strong>development</strong> for real bank connections (100 live items free),
                  or <strong>production</strong> for unlimited live connections.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {allAccounts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Cash & Deposits" value={totalBalances.depository} icon="🏦" color="text-green-600" />
          <SummaryCard label="Credit Balance" value={totalBalances.credit} icon="💳" color="text-orange-600" />
          <SummaryCard label="Loans Outstanding" value={totalBalances.loan} icon="🏠" color="text-red-600" />
          <SummaryCard label="Investments" value={totalBalances.investment} icon="📈" color="text-blue-600" />
        </div>
      )}

      {/* Tabs */}
      {institutions.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-4">
            {(["accounts", "transactions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "accounts" ? `Accounts (${allAccounts.length})` : `Transactions (${allTransactions.length})`}
              </button>
            ))}
          </nav>
        </div>
      )}

      {loadingAccounts && (
        <div className="text-center py-10 text-gray-500">Loading account data...</div>
      )}

      {/* Accounts Tab */}
      {activeTab === "accounts" && institutions.length > 0 && (
        <div className="space-y-4">
          {institutions.map((inst) => (
            <div key={inst.accessToken} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏦</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{inst.name}</h3>
                    <p className="text-xs text-gray-500">{inst.accounts.length} accounts connected</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => refreshInstitution(inst.accessToken, inst.name)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => disconnectInstitution(inst.accessToken)}
                    className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Account</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Number</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Current Balance</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {inst.accounts.map((acct) => (
                    <tr key={acct.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span>{ACCOUNT_TYPE_ICONS[acct.type] || "💼"}</span>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {acct.officialName || acct.name}
                            </p>
                            {acct.officialName && acct.name !== acct.officialName && (
                              <p className="text-xs text-gray-500">{acct.name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-400">
                        {ACCOUNT_TYPE_LABELS[acct.subtype || ""] || acct.subtype || acct.type}
                      </td>
                      <td className="px-6 py-3 font-mono text-gray-500">
                        {acct.mask ? `****${acct.mask}` : "—"}
                      </td>
                      <td className={`px-6 py-3 text-right font-mono font-semibold ${
                        acct.type === "loan" || acct.type === "credit"
                          ? "text-red-600"
                          : "text-green-600"
                      }`}>
                        {fmt(acct.balances.current)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                        {acct.type === "depository" ? fmt(acct.balances.available) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === "transactions" && allTransactions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Description</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Category</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Institution</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Amount</th>
                  <th className="text-center px-6 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {allTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {txn.date}
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{txn.name}</p>
                      {txn.merchantName && txn.merchantName !== txn.name && (
                        <p className="text-xs text-gray-500">{txn.merchantName}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{txn.category}</td>
                    <td className="px-6 py-3 text-gray-500">{txn.institution}</td>
                    <td className={`px-6 py-3 text-right font-mono font-semibold ${
                      txn.amount > 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {txn.amount > 0 ? "-" : "+"}
                      {fmt(Math.abs(txn.amount))}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        txn.pending
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      }`}>
                        {txn.pending ? "Pending" : "Posted"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state for transactions tab */}
      {activeTab === "transactions" && allTransactions.length === 0 && institutions.length > 0 && !loadingAccounts && (
        <div className="text-center py-10 text-gray-500">
          No transactions found. Transactions may take a moment to sync after connecting an account.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
    </div>
  );
}
