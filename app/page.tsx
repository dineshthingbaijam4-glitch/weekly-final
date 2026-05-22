"use client";

import { useEffect, useState, useCallback } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { RefreshCw, Users, CalendarCheck, Trophy, TrendingUp } from "lucide-react";

const SHEET_ID = "2PACX-1vRwv447rh-Dhy5TxMWmcb8y7b2ih-mM1q5zHsEd7j5maWUM6kJsar3LVmE8qsFUwWwCxJKdaVn5gSBC";
const csvUrl = (gid: string) =>
  `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${gid}&single=true&output=csv`;

const GID_CANDIDATES = "0";
const GID_INTERVIEWS = "1";

interface CandidateRow { date: string; name: string; designation: string; }
interface InterviewRow { date: string; name: string; designation: string; status: string; }
interface FunnelRow { role: string; screened: number; interviewed: number; selected: number; conversionRate: number; }

function parseCsv<T>(url: string, mapFn: (r: Record<string, string>) => T): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => resolve((res.data as Record<string, string>[]).map(mapFn)),
      error: reject,
    });
  });
}

function normalize(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export default function TADashboard() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState<"all" | "thisweek">("thisweek");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candidates, interviews] = await Promise.all([
        parseCsv(csvUrl(GID_CANDIDATES), (r) => ({
          date: r["Date"] || r["date"] || "",
          name: r["Candidate Name"] || r["candidate name"] || "",
          designation: r["Designation"] || r["designation"] || "",
        } as CandidateRow)),
        parseCsv(csvUrl(GID_INTERVIEWS), (r) => ({
          date: r["Date"] || r["date"] || "",
          name: r["Candidate Name"] || r["candidate name"] || "",
          designation: r["Designation"] || r["designation"] || "",
          status: r["Status"] || r["status"] || "",
        } as InterviewRow)),
      ]);

      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      function inThisWeek(dateStr: string) {
        const d = new Date(dateStr);
        return d >= monday && d <= sunday;
      }

      const fc = weekFilter === "thisweek" ? candidates.filter(c => inThisWeek(c.date)) : candidates;
      const fi = weekFilter === "thisweek" ? interviews.filter(i => inThisWeek(i.date)) : interviews;

      const screened: Record<string, number> = {};
      fc.forEach(c => {
        const key = normalize(c.designation);
        if (key) screened[key] = (screened[key] || 0) + 1;
      });

      const interviewed: Record<string, number> = {};
      const selected: Record<string, number> = {};
      fi.forEach(i => {
        const key = normalize(i.designation);
        if (!key) return;
        interviewed[key] = (interviewed[key] || 0) + 1;
        if (normalize(i.status).includes("select")) selected[key] = (selected[key] || 0) + 1;
      });

      const allRoles = Array.from(new Set([...Object.keys(screened), ...Object.keys(interviewed)]));
      const rows: FunnelRow[] = allRoles
        .map(role => {
          const s = screened[role] || 0;
          const iv = interviewed[role] || 0;
          const sel = selected[role] || 0;
          return {
            role: role.replace(/\b\w/g, l => l.toUpperCase()),
            screened: s, interviewed: iv, selected: sel,
            conversionRate: s > 0 ? Math.round((sel / s) * 100) : 0,
          };
        })
        .filter(r => r.screened > 0 || r.interviewed > 0)
        .sort((a, b) => b.screened - a.screened);

      setFunnel(rows);
      setLastRefresh(new Date());
    } catch (e) {
      setError("Failed to load data. Please check your sheet is published to web.");
      console.error(e);
    }
    setLoading(false);
  }, [weekFilter]);

  useEffect(() => { load(); }, [load]);

  const totals = funnel.reduce(
    (acc, r) => ({ screened: acc.screened + r.screened, interviewed: acc.interviewed + r.interviewed, selected: acc.selected + r.selected }),
    { screened: 0, interviewed: 0, selected: 0 }
  );
  const overallConversion = totals.screened > 0 ? Math.round((totals.selected / totals.screened) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.15), transparent)" }} />

      <header className="relative border-b border-white/5 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            TA Weekly <span style={{ color: "#818cf8" }}>Dashboard</span>
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(["thisweek", "all"] as const).map(w => (
              <button key={w} onClick={() => setWeekFilter(w)}
                className="px-4 py-1.5 text-sm font-medium transition-all"
                style={{ background: weekFilter === w ? "#818cf8" : "transparent", color: weekFilter === w ? "#fff" : "rgba(255,255,255,0.5)" }}>
                {w === "thisweek" ? "This Week" : "All Time"}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <main className="relative px-8 py-8 max-w-7xl mx-auto">
        {error && <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Profiles Screened", value: totals.screened, icon: Users, color: "#818cf8" },
            { label: "Sent to Interview", value: totals.interviewed, icon: CalendarCheck, color: "#34d399" },
            { label: "Selected", value: totals.selected, icon: Trophy, color: "#fbbf24" },
            { label: "Conversion Rate", value: `${overallConversion}%`, icon: TrendingUp, color: "#f472b6" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl p-5 border border-white/5" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/40 text-sm">{label}</span>
                <div className="p-2 rounded-lg" style={{ background: `${color}15` }}>
                  <Icon size={16} style={{ color }} />
                </div>
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "2rem", fontWeight: 800, color }}>
                {loading ? "—" : value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="rounded-2xl p-6 border border-white/5" style={{ background: "rgba(255,255,255,0.03)" }}>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Funnel by Role</h2>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-white/20">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnel.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="role" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#fff" }} />
                  <Bar dataKey="screened" name="Screened" fill="#818cf8" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="interviewed" name="Interviewed" fill="#34d399" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="selected" name="Selected" fill="#fbbf24" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-2xl p-6 border border-white/5" style={{ background: "rgba(255,255,255,0.03)" }}>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Conversion Rate by Role</h2>
            <div className="space-y-3 overflow-y-auto max-h-[280px] pr-1">
              {loading ? <div className="text-white/20 text-sm">Loading…</div>
                : funnel.length === 0 ? <div className="text-white/20 text-sm">No data for this period.</div>
                : funnel.map(r => (
                  <div key={r.role}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white/70 truncate">{r.role}</span>
                      <span className="text-white/40 ml-2 shrink-0">{r.conversionRate}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${r.conversionRate}%`, background: r.conversionRate > 20 ? "#34d399" : r.conversionRate > 5 ? "#818cf8" : "#f472b6" }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">All Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Role / Designation", "Screened", "Interviewed", "Selected", "Conversion"].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-white/30 font-medium text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className="px-6 py-8 text-center text-white/20">Loading data…</td></tr>
                  : funnel.length === 0 ? <tr><td colSpan={5} className="px-6 py-8 text-center text-white/20">No data found for this period.</td></tr>
                  : funnel.map(r => (
                    <tr key={r.role} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium text-white/80">{r.role}</td>
                      <td className="px-6 py-4 text-indigo-400 font-semibold">{r.screened}</td>
                      <td className="px-6 py-4 text-emerald-400 font-semibold">{r.interviewed}</td>
                      <td className="px-6 py-4 text-amber-400 font-semibold">{r.selected}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{
                            background: r.conversionRate > 20 ? "rgba(52,211,153,0.15)" : r.conversionRate > 5 ? "rgba(129,140,248,0.15)" : "rgba(244,114,182,0.1)",
                            color: r.conversionRate > 20 ? "#34d399" : r.conversionRate > 5 ? "#818cf8" : "#f472b6",
                          }}>
                          {r.conversionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-center text-white/20 text-xs">Data sourced live from Google Sheets · Updates on refresh</p>
      </main>
    </div>
  );
}
