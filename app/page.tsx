"use client";

import { useEffect, useState, useCallback } from "react";
import Papa from "papaparse";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCw, Users, CalendarCheck, Trophy, TrendingUp, Settings, X, CheckCircle, Briefcase } from "lucide-react";

interface OpenPositionRow { centre: string; uniqueId: string; role: string; }
interface CandidateRow { date: string; name: string; designation: string; }
interface InterviewRow { date: string; name: string; designation: string; status: string; }
interface FunnelRow { role: string; centre: string; uniqueId: string; screened: number; interviewed: number; selected: number; conversionRate: number; }

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

const SK = { candidates: "ta_csv_candidates", interviews: "ta_csv_interviews", positions: "ta_csv_positions" };

export default function TADashboard() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [openPositions, setOpenPositions] = useState<OpenPositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState<"all" | "thisweek">("thisweek");
  const [showSettings, setShowSettings] = useState(false);
  const [urls, setUrls] = useState({ candidates: "", interviews: "", positions: "" });
  const [savedUrls, setSavedUrls] = useState({ candidates: "", interviews: "", positions: "" });
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const saved = {
      candidates: localStorage.getItem(SK.candidates) || "",
      interviews: localStorage.getItem(SK.interviews) || "",
      positions: localStorage.getItem(SK.positions) || "",
    };
    setUrls(saved);
    setSavedUrls(saved);
    if (!saved.candidates || !saved.interviews) setShowSettings(true);
  }, []);

  const saveUrls = () => {
    const trimmed = { candidates: urls.candidates.trim(), interviews: urls.interviews.trim(), positions: urls.positions.trim() };
    localStorage.setItem(SK.candidates, trimmed.candidates);
    localStorage.setItem(SK.interviews, trimmed.interviews);
    localStorage.setItem(SK.positions, trimmed.positions);
    setSavedUrls(trimmed);
    setSaveSuccess(true);
    setTimeout(() => { setSaveSuccess(false); setShowSettings(false); }, 1200);
  };

  const load = useCallback(async () => {
    if (!savedUrls.candidates || !savedUrls.interviews) return;
    setLoading(true);
    setError(null);
    try {
      const fetches: [Promise<CandidateRow[]>, Promise<InterviewRow[]>, Promise<OpenPositionRow[]>] = [
        parseCsv(savedUrls.candidates, (r) => ({
          date: r["Date"] || r["date"] || "",
          name: r["Candidate Name"] || r["candidate name"] || "",
          designation: r["Designation"] || r["designation"] || "",
        })),
        parseCsv(savedUrls.interviews, (r) => ({
          date: r["Date"] || r["date"] || "",
          name: r["Candidate Name"] || r["candidate name"] || "",
          designation: r["Designation"] || r["designation"] || "",
          status: r["Status"] || r["status"] || "",
        })),
        savedUrls.positions
          ? parseCsv(savedUrls.positions, (r) => ({
              centre: r["Centres"] || r["centres"] || r["Centre"] || "",
              uniqueId: r["Unique TA ID"] || r["Unique ID"] || r["unique id"] || "",
              role: r["Role"] || r["role"] || r["Designation"] || "",
            }))
          : Promise.resolve([]),
      ];

      const [candidates, interviews, positions] = await Promise.all(fetches);
      setOpenPositions(positions);

      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const inThisWeek = (dateStr: string) => { const d = new Date(dateStr); return d >= monday && d <= sunday; };
      const fc = weekFilter === "thisweek" ? candidates.filter(c => inThisWeek(c.date)) : candidates;
      const fi = weekFilter === "thisweek" ? interviews.filter(i => inThisWeek(i.date)) : interviews;

      // Build screened/interviewed/selected maps
      const screened: Record<string, number> = {};
      fc.forEach(c => { const k = normalize(c.designation); if (k) screened[k] = (screened[k] || 0) + 1; });

      const interviewed: Record<string, number> = {};
      const selected: Record<string, number> = {};
      fi.forEach(i => {
        const k = normalize(i.designation);
        if (!k) return;
        interviewed[k] = (interviewed[k] || 0) + 1;
        if (normalize(i.status).includes("select")) selected[k] = (selected[k] || 0) + 1;
      });

      // If open positions loaded, use them as the source of truth for roles
      let rows: FunnelRow[];
      if (positions.length > 0) {
        rows = positions.map(p => {
          const k = normalize(p.role);
          const s = screened[k] || 0;
          const iv = interviewed[k] || 0;
          const sel = selected[k] || 0;
          return {
            role: p.role.trim(),
            centre: p.centre,
            uniqueId: p.uniqueId,
            screened: s, interviewed: iv, selected: sel,
            conversionRate: s > 0 ? Math.round((sel / s) * 100) : 0,
          };
        }).sort((a, b) => b.screened - a.screened);
      } else {
        const allRoles = Array.from(new Set([...Object.keys(screened), ...Object.keys(interviewed)]));
        rows = allRoles.map(role => {
          const s = screened[role] || 0;
          const iv = interviewed[role] || 0;
          const sel = selected[role] || 0;
          return { role: role.replace(/\b\w/g, l => l.toUpperCase()), centre: "", uniqueId: "", screened: s, interviewed: iv, selected: sel, conversionRate: s > 0 ? Math.round((sel / s) * 100) : 0 };
        }).filter(r => r.screened > 0 || r.interviewed > 0).sort((a, b) => b.screened - a.screened);
      }

      setFunnel(rows);
      setLastRefresh(new Date());
    } catch (e) {
      setError("Failed to load data. Make sure your sheets are published as CSV.");
      console.error(e);
    }
    setLoading(false);
  }, [savedUrls, weekFilter]);

  useEffect(() => { if (savedUrls.candidates && savedUrls.interviews) load(); }, [load, savedUrls]);

  const totals = funnel.reduce((acc, r) => ({ screened: acc.screened + r.screened, interviewed: acc.interviewed + r.interviewed, selected: acc.selected + r.selected }), { screened: 0, interviewed: 0, selected: 0 });
  const overallConversion = totals.screened > 0 ? Math.round((totals.selected / totals.screened) * 100) : 0;
  const hasPositions = openPositions.length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.15), transparent)" }} />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg mx-4 rounded-2xl border border-white/10 p-6" style={{ background: "#0f0f1a" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.2rem", fontWeight: 800 }}>Connect Google Sheets</h2>
              {savedUrls.candidates && savedUrls.interviews && (
                <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white transition-colors"><X size={18} /></button>
              )}
            </div>

            <div className="mb-4 p-3 rounded-lg text-xs text-white/50 border border-white/5" style={{ background: "rgba(129,140,248,0.05)" }}>
              <strong className="text-white/70">File → Share → Publish to web</strong> → select each tab → choose <strong className="text-white/70">CSV</strong> → Publish → copy the link
            </div>

            <div className="space-y-4">
              {[
                { key: "positions", label: "Open Positions CSV URL", placeholder: "...pub?gid=...&output=csv", optional: false },
                { key: "candidates", label: "Candidate Tracker CSV URL", placeholder: "...pub?gid=...&output=csv", optional: false },
                { key: "interviews", label: "Interview Tracker CSV URL", placeholder: "...pub?gid=...&output=csv", optional: false },
              ].map(({ key, label, placeholder, optional }) => (
                <div key={key}>
                  <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                    {label} {optional && <span className="text-white/20 normal-case">(optional)</span>}
                  </label>
                  <input
                    value={urls[key as keyof typeof urls]}
                    onChange={e => setUrls(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white/80 border border-white/10 outline-none focus:border-indigo-500/50 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  />
                </div>
              ))}
            </div>

            <button onClick={saveUrls} disabled={!urls.candidates.trim() || !urls.interviews.trim()}
              className="mt-5 w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ background: saveSuccess ? "#34d399" : "#818cf8", color: "#fff" }}>
              {saveSuccess ? <><CheckCircle size={16} /> Saved!</> : "Save & Load Data"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative border-b border-white/5 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            TA Weekly <span style={{ color: "#818cf8" }}>Dashboard</span>
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()}` : "Paste your sheet links to get started"}
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
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all">
            <Settings size={14} /> Settings
          </button>
          <button onClick={load} disabled={loading || !savedUrls.candidates}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all disabled:opacity-40">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      <main className="relative px-8 py-8 max-w-7xl mx-auto">
        {error && <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {!savedUrls.candidates ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="p-4 rounded-2xl mb-4" style={{ background: "rgba(129,140,248,0.1)" }}>
              <Settings size={32} style={{ color: "#818cf8" }} />
            </div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.2rem", fontWeight: 800 }} className="mb-2">Connect your Google Sheet</h3>
            <p className="text-white/40 text-sm mb-5">Paste your published CSV links to start seeing data</p>
            <button onClick={() => setShowSettings(true)} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "#818cf8", color: "#fff" }}>
              Open Settings
            </button>
          </div>
        ) : <>
          {/* KPI Cards */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            {[
              { label: "Open Positions", value: hasPositions ? openPositions.length : "—", icon: Briefcase, color: "#a78bfa" },
              { label: "Profiles Screened", value: totals.screened, icon: Users, color: "#818cf8" },
              { label: "Sent to Interview", value: totals.interviewed, icon: CalendarCheck, color: "#34d399" },
              { label: "Selected", value: totals.selected, icon: Trophy, color: "#fbbf24" },
              { label: "Conversion Rate", value: `${overallConversion}%`, icon: TrendingUp, color: "#f472b6" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-2xl p-5 border border-white/5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white/40 text-sm">{label}</span>
                  <div className="p-2 rounded-lg" style={{ background: `${color}15` }}><Icon size={16} style={{ color }} /></div>
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "2rem", fontWeight: 800, color }}>
                  {loading ? "—" : value}
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Conversion */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="rounded-2xl p-6 border border-white/5" style={{ background: "rgba(255,255,255,0.03)" }}>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Funnel by Role</h2>
              {loading ? <div className="h-64 flex items-center justify-center text-white/20">Loading…</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={funnel.filter(r => r.screened > 0 || r.interviewed > 0).slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20 }}>
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
                  : funnel.filter(r => r.screened > 0).length === 0 ? <div className="text-white/20 text-sm">No data for this period.</div>
                  : funnel.filter(r => r.screened > 0).map(r => (
                    <div key={r.role + r.uniqueId}>
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

          {/* Full Table */}
          <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">All Open Positions</h2>
              {hasPositions && <span className="text-xs text-white/20">{openPositions.length} positions</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {[...(hasPositions ? ["Centre", "ID"] : []), "Role / Designation", "Screened", "Interviewed", "Selected", "Conversion"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-white/30 font-medium text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} className="px-6 py-8 text-center text-white/20">Loading data…</td></tr>
                    : funnel.length === 0 ? <tr><td colSpan={7} className="px-6 py-8 text-center text-white/20">No positions found.</td></tr>
                    : funnel.map((r, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        {hasPositions && <td className="px-6 py-4 text-white/40 text-xs">{r.centre}</td>}
                        {hasPositions && <td className="px-6 py-4 text-white/40 text-xs font-mono">{r.uniqueId}</td>}
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
                            {r.screened > 0 ? `${r.conversionRate}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-4 text-center text-white/20 text-xs">Data sourced live from Google Sheets · Updates on refresh</p>
        </>}
      </main>
    </div>
  );
}
