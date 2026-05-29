"use client";

import { useState } from "react";

/* ── Stage definitions ─────────────────────────────────────────────── */
interface PipelineDeal {
  id: string;
  owner: string;
  property: string;
  propertyType: string;
  municipality: string;
  assessedValue: number;
  stage: string;
  lastActivity: string;
  notes: string;
}

const STAGES = [
  { key: "lead", label: "New Lead", color: "bg-gray-500", prob: 0.05 },
  { key: "contacted", label: "Contacted", color: "bg-blue-500", prob: 0.15 },
  { key: "meeting", label: "Meeting Set", color: "bg-indigo-500", prob: 0.3 },
  { key: "proposal", label: "Proposal Sent", color: "bg-yellow-500", prob: 0.5 },
  { key: "negotiating", label: "Negotiating", color: "bg-orange-500", prob: 0.75 },
  { key: "won", label: "Closed Won", color: "bg-green-600", prob: 1.0 },
  { key: "lost", label: "Closed Lost", color: "bg-red-500", prob: 0 },
];

/* ── Seed pipeline deals from top prospects ────────────────────────── */
const SEED_DEALS: PipelineDeal[] = [
  { id: "D-001", owner: "Falk Family LLC", property: "1100 Connery Cv, Waunakee", propertyType: "Industrial/Flex", municipality: "WAUNAKEE", assessedValue: 3500000, stage: "proposal", lastActivity: "2025-05-22", notes: "Sent management proposal. Owner in Hillsborough, CA — very interested in local management." },
  { id: "D-002", owner: "SPTMNR Properties Trust", property: "5601 Burke Rd, Madison", propertyType: "Office", municipality: "MADISON", assessedValue: 3300000, stage: "contacted", lastActivity: "2025-05-20", notes: "Initial call with trustee in Boston. Scheduling site visit." },
  { id: "D-003", owner: "Barsky Family Ltd Partnership", property: "546 N Grand Ave, Sun Prairie", propertyType: "Retail", municipality: "SUN PRAIRIE", assessedValue: 3300000, stage: "meeting", lastActivity: "2025-05-24", notes: "Meeting next Tuesday. Owner in Deerfield, IL, managing remotely for 12 years." },
  { id: "D-004", owner: "Erdman Properties LLC", property: "5117 S Beltline, Madison", propertyType: "Office/Mixed-Use", municipality: "MADISON", assessedValue: 8200000, stage: "lead", lastActivity: "2025-05-18", notes: "Direct mail sent. Multi-tenant office, high value target." },
  { id: "D-005", owner: "Hiebing Holdings", property: "316 W Washington Ave, Madison", propertyType: "Office", municipality: "MADISON", assessedValue: 4100000, stage: "negotiating", lastActivity: "2025-05-26", notes: "Finalizing fee structure. Owner wants quarterly reporting." },
  { id: "D-006", owner: "Robertson Rd Industrial LLC", property: "2850 Robertson Rd, Madison", propertyType: "Industrial/Flex", municipality: "MADISON", assessedValue: 2800000, stage: "proposal", lastActivity: "2025-05-21", notes: "7-unit industrial. Fully leased. Owner self-managing for 15 years — ready to hand off." },
  { id: "D-007", owner: "Cottage Grove Retail Partners", property: "400 W Cottage Grove Rd", propertyType: "Retail", municipality: "COTTAGE GROVE", assessedValue: 1900000, stage: "won", lastActivity: "2025-05-15", notes: "Signed. Onboarding in progress." },
  { id: "D-008", owner: "Summit Self Storage LLC", property: "1205 Hwy 51, DeForest", propertyType: "Self-Storage", municipality: "DEFOREST", assessedValue: 2100000, stage: "contacted", lastActivity: "2025-05-23", notes: "Left voicemail, sent follow-up email. Out-of-state owner in Arizona." },
  { id: "D-009", owner: "Prairie Capital Partners", property: "2701 International Ln, Madison", propertyType: "Office/Flex", municipality: "MADISON", assessedValue: 5600000, stage: "lead", lastActivity: "2025-05-17", notes: "Identified from parcel data. High-value office/flex, remote owner." },
  { id: "D-010", owner: "Midwest Flex Properties LLC", property: "4602 Femrite Dr, Madison", propertyType: "Industrial/Flex", municipality: "MADISON", assessedValue: 3100000, stage: "meeting", lastActivity: "2025-05-25", notes: "Zoom call scheduled. Owner in Minnesota, has 3 properties in Dane County." },
  { id: "D-011", owner: "Verona Commerce Center LLC", property: "500 W Verona Ave, Verona", propertyType: "Office/Mixed-Use", municipality: "VERONA", assessedValue: 4500000, stage: "lead", lastActivity: "2025-05-19", notes: "Direct mail sent. Mixed-use center, 60% occupied." },
  { id: "D-012", owner: "Stoughton Industrial Holdings", property: "200 Industrial Dr, Stoughton", propertyType: "Industrial", municipality: "STOUGHTON", assessedValue: 5300000, stage: "contacted", lastActivity: "2025-05-21", notes: "Spoke with operations manager. Forwarding to owner in Texas." },
  { id: "D-013", owner: "Fitchburg Medical Plaza LLC", property: "3050 Cahill Main, Fitchburg", propertyType: "Medical/Professional", municipality: "FITCHBURG", assessedValue: 6700000, stage: "lead", lastActivity: "2025-05-16", notes: "High-value medical office. Identified from property type analysis." },
  { id: "D-014", owner: "Sun Prairie Retail Investors", property: "625 W Main St, Sun Prairie", propertyType: "Retail", municipality: "SUN PRAIRIE", assessedValue: 2300000, stage: "lost", lastActivity: "2025-05-10", notes: "Decided to continue self-managing. Follow up in 6 months." },
  { id: "D-015", owner: "Waunakee Business Park LLC", property: "100 Centennial St, Waunakee", propertyType: "Industrial/Flex", municipality: "WAUNAKEE", assessedValue: 3800000, stage: "negotiating", lastActivity: "2025-05-26", notes: "Down to terms. 5% management fee proposed. Owner comparing with one other firm." },
];

/* ── Outbound Activity KPIs (monthly tracking) ─────────────────────── */
interface MonthActivity {
  month: string;
  lettersSent: number;
  callsMade: number;
  emailsSent: number;
  meetingsBooked: number;
  proposalsDelivered: number;
}

const ACTIVITY_DATA: MonthActivity[] = [
  { month: "Jan 2025", lettersSent: 50, callsMade: 30, emailsSent: 45, meetingsBooked: 3, proposalsDelivered: 1 },
  { month: "Feb 2025", lettersSent: 50, callsMade: 42, emailsSent: 55, meetingsBooked: 5, proposalsDelivered: 2 },
  { month: "Mar 2025", lettersSent: 75, callsMade: 55, emailsSent: 68, meetingsBooked: 7, proposalsDelivered: 3 },
  { month: "Apr 2025", lettersSent: 75, callsMade: 60, emailsSent: 72, meetingsBooked: 8, proposalsDelivered: 4 },
  { month: "May 2025", lettersSent: 100, callsMade: 78, emailsSent: 90, meetingsBooked: 10, proposalsDelivered: 5 },
];

function fmt(n: number) {
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function SalesPipeline() {
  const [deals] = useState<PipelineDeal[]>(SEED_DEALS);
  const [expandedDeal, setExpandedDeal] = useState<string | null>(null);

  const activeStages = STAGES.filter((s) => s.key !== "won" && s.key !== "lost");
  const activeDealsByStage = activeStages.map((s) => ({
    ...s,
    deals: deals.filter((d) => d.stage === s.key),
    value: deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + d.assessedValue, 0),
  }));

  const wonDeals = deals.filter((d) => d.stage === "won");
  const lostDeals = deals.filter((d) => d.stage === "lost");
  const activeDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");

  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + d.assessedValue, 0);
  const weightedForecast = activeDeals.reduce((sum, d) => {
    const stage = STAGES.find((s) => s.key === d.stage);
    return sum + d.assessedValue * (stage?.prob || 0);
  }, 0);

  const totalActivity = ACTIVITY_DATA[ACTIVITY_DATA.length - 1];
  const prevActivity = ACTIVITY_DATA[ACTIVITY_DATA.length - 2];

  // Cumulative totals
  const cumLetters = ACTIVITY_DATA.reduce((s, a) => s + a.lettersSent, 0);
  const cumCalls = ACTIVITY_DATA.reduce((s, a) => s + a.callsMade, 0);
  const cumEmails = ACTIVITY_DATA.reduce((s, a) => s + a.emailsSent, 0);
  const cumMeetings = ACTIVITY_DATA.reduce((s, a) => s + a.meetingsBooked, 0);
  const cumProposals = ACTIVITY_DATA.reduce((s, a) => s + a.proposalsDelivered, 0);

  // Conversion rates
  const contactRate = activeDeals.length > 0
    ? deals.filter((d) => d.stage !== "lead").length / deals.length
    : 0;
  const meetingRate = deals.filter((d) => ["meeting", "proposal", "negotiating", "won"].includes(d.stage)).length / Math.max(deals.filter((d) => d.stage !== "lead").length, 1);
  const proposalRate = deals.filter((d) => ["proposal", "negotiating", "won"].includes(d.stage)).length / Math.max(deals.filter((d) => ["meeting", "proposal", "negotiating", "won"].includes(d.stage)).length, 1);
  const closeRate = wonDeals.length / Math.max(wonDeals.length + lostDeals.length, 1);

  // Max funnel width for bar chart
  const maxStageValue = Math.max(...activeDealsByStage.map((s) => s.value), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Sales Pipeline
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          BIG property management — outbound activity &amp; deal tracking
        </p>
      </div>

      {/* ── Pipeline KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <KpiCard label="Active Deals" value={String(activeDeals.length)} />
        <KpiCard label="Pipeline Value" value={fmt(totalPipelineValue)} accent="text-blue-600" />
        <KpiCard label="Weighted Forecast" value={fmt(weightedForecast)} accent="text-green-600" />
        <KpiCard label="Closed Won" value={String(wonDeals.length)} accent="text-green-600" />
        <KpiCard label="Won Value" value={fmt(wonDeals.reduce((s, d) => s + d.assessedValue, 0))} accent="text-green-600" />
      </div>

      {/* ── Outbound Activity KPIs ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Outbound Activity — This Month vs. Last
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <ActivityKpi label="Letters Sent" current={totalActivity.lettersSent} previous={prevActivity.lettersSent} cumulative={cumLetters} />
          <ActivityKpi label="Calls Made" current={totalActivity.callsMade} previous={prevActivity.callsMade} cumulative={cumCalls} />
          <ActivityKpi label="Emails Sent" current={totalActivity.emailsSent} previous={prevActivity.emailsSent} cumulative={cumEmails} />
          <ActivityKpi label="Meetings Booked" current={totalActivity.meetingsBooked} previous={prevActivity.meetingsBooked} cumulative={cumMeetings} />
          <ActivityKpi label="Proposals Delivered" current={totalActivity.proposalsDelivered} previous={prevActivity.proposalsDelivered} cumulative={cumProposals} />
        </div>

        {/* Monthly trend table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Month</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Letters</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Calls</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Emails</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Meetings</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Proposals</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Total Touches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {ACTIVITY_DATA.map((a) => (
                <tr key={a.month} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{a.month}</td>
                  <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{a.lettersSent}</td>
                  <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{a.callsMade}</td>
                  <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{a.emailsSent}</td>
                  <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{a.meetingsBooked}</td>
                  <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{a.proposalsDelivered}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                    {a.lettersSent + a.callsMade + a.emailsSent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Conversion Metrics ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Conversion Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <ConversionMetric label="Lead → Contact" rate={contactRate} description="of leads contacted" />
          <ConversionMetric label="Contact → Meeting" rate={meetingRate} description="converted to meetings" />
          <ConversionMetric label="Meeting → Proposal" rate={proposalRate} description="received proposals" />
          <ConversionMetric label="Win Rate" rate={closeRate} description="of decided deals won" />
        </div>
      </div>

      {/* ── Pipeline Funnel ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Pipeline by Stage
        </h2>
        <div className="space-y-3">
          {activeDealsByStage.map((stage) => (
            <div key={stage.key} className="flex items-center gap-4">
              <span className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300 text-right">
                {stage.label}
              </span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-8 overflow-hidden">
                <div
                  className={`h-full ${stage.color} rounded-full flex items-center px-3 transition-all`}
                  style={{ width: `${Math.max((stage.value / maxStageValue) * 100, 5)}%` }}
                >
                  <span className="text-xs text-white font-medium whitespace-nowrap">
                    {stage.deals.length} deal{stage.deals.length !== 1 ? "s" : ""} — {fmt(stage.value)}
                  </span>
                </div>
              </div>
              <span className="w-16 text-xs text-gray-500 text-right">
                {Math.round(stage.prob * 100)}% prob
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Deal List ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Active Deals
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Click a row for details and notes
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Stage</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Property</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Assessed Value</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Weighted</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {deals
                .filter((d) => d.stage !== "won" && d.stage !== "lost")
                .sort((a, b) => {
                  const aIdx = STAGES.findIndex((s) => s.key === a.stage);
                  const bIdx = STAGES.findIndex((s) => s.key === b.stage);
                  return bIdx - aIdx;
                })
                .map((deal) => {
                  const stage = STAGES.find((s) => s.key === deal.stage);
                  const weighted = deal.assessedValue * (stage?.prob || 0);
                  return (
                    <>
                      <tr
                        key={deal.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                        onClick={() => setExpandedDeal(expandedDeal === deal.id ? null : deal.id)}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-bold text-white ${stage?.color || "bg-gray-500"}`}>
                            {stage?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{deal.owner}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{deal.property}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{deal.propertyType}</td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">{fmt(deal.assessedValue)}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">{fmt(weighted)}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{deal.lastActivity}</td>
                      </tr>
                      {expandedDeal === deal.id && (
                        <tr key={`note-${deal.id}`} className="bg-blue-50 dark:bg-blue-900/20">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-gray-500">Municipality</p>
                                <p className="font-medium text-gray-900 dark:text-white">{deal.municipality}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Win Probability</p>
                                <p className="font-medium text-gray-900 dark:text-white">{Math.round((stage?.prob || 0) * 100)}%</p>
                              </div>
                              <div className="md:col-span-1">
                                <p className="text-xs text-gray-500">Deal ID</p>
                                <p className="font-medium text-gray-900 dark:text-white">{deal.id}</p>
                              </div>
                              <div className="col-span-2 md:col-span-3">
                                <p className="text-xs text-gray-500">Notes</p>
                                <p className="font-medium text-gray-900 dark:text-white">{deal.notes}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Won / Lost summary */}
        {(wonDeals.length > 0 || lostDeals.length > 0) && (
          <div className="p-6 border-t border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {wonDeals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-700 mb-2">Closed Won ({wonDeals.length})</h3>
                  {wonDeals.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{d.owner}</span>
                      <span className="font-medium text-green-600">{fmt(d.assessedValue)}</span>
                    </div>
                  ))}
                </div>
              )}
              {lostDeals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-2">Closed Lost ({lostDeals.length})</h3>
                  {lostDeals.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{d.owner}</span>
                      <span className="font-medium text-red-600">{fmt(d.assessedValue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Revenue Forecast ────────────────────────────────────────── */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-100 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3">
          Revenue Forecast (Weighted Pipeline)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-blue-700 dark:text-blue-300">Total Pipeline (unweighted)</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{fmt(totalPipelineValue)}</p>
            <p className="text-xs text-blue-600 mt-1">{activeDeals.length} active deals</p>
          </div>
          <div>
            <p className="text-blue-700 dark:text-blue-300">Weighted Forecast</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{fmt(weightedForecast)}</p>
            <p className="text-xs text-blue-600 mt-1">Based on stage probability</p>
          </div>
          <div>
            <p className="text-blue-700 dark:text-blue-300">Avg Deal Size</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {activeDeals.length > 0 ? fmt(totalPipelineValue / activeDeals.length) : "$0"}
            </p>
            <p className="text-xs text-blue-600 mt-1">Assessed value per deal</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable KPI components ─────────────────────────────────────── */
function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent || "text-gray-900 dark:text-white"}`}>{value}</p>
    </div>
  );
}

function ActivityKpi({ label, current, previous, cumulative }: { label: string; current: number; previous: number; cumulative: number }) {
  const delta = current - previous;
  const pct = previous > 0 ? Math.round((delta / previous) * 100) : 0;
  const up = delta >= 0;

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{current}</p>
      <div className="flex items-center gap-1 mt-1">
        <span className={`text-xs font-medium ${up ? "text-green-600" : "text-red-600"}`}>
          {up ? "+" : ""}{pct}%
        </span>
        <span className="text-xs text-gray-400">vs last month</span>
      </div>
      <p className="text-xs text-gray-400 mt-1">{cumulative} YTD</p>
    </div>
  );
}

function ConversionMetric({ label, rate, description }: { label: string; rate: number; description: string }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="relative w-20 h-20 mx-auto">
        <svg className="w-full h-full" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="3"
            strokeDasharray={`${pct}, 100`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900 dark:text-white">
          {pct}%
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-2">{description}</p>
    </div>
  );
}
