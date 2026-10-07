"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Database, BarChart3, Zap, Loader2,
  Cpu, Globe, CheckCircle2, Download, ExternalLink,
  Microscope, FileText, ChevronRight, TrendingUp
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer
} from 'recharts';
// After line 15 (after the recharts imports)
import ConstellationLoader from "@/components/ConstellationLoader";
import { useDeepProgress } from "@/hooks/useDeepProgress";
import RocketLoader from "@/components/RocketLoader";
import NeuralBackground from "@/components/NeuralBackground";
import type { AppState } from "@/components/NeuralBackground";
import { useDynamicPlaceholder } from "@/hooks/useDynamicPlaceholder";

const COLORS = ['#a855f7','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16'];

// ─── Stepper ─────────────────────────────────────────────────
const AgentSteps = ({ currentStep, isDeep }: { currentStep: number; isDeep: boolean }) => {
  const steps = isDeep
    ? [{ name: 'DEEP SCAN', icon: <Search size={14} /> }, { name: 'MAPPING', icon: <Database size={14} /> }, { name: 'SYNTHESIS', icon: <Microscope size={14} /> }]
    : [{ name: 'RESEARCH', icon: <Search size={14} /> }, { name: 'ANALYSIS', icon: <Database size={14} /> }, { name: 'STRATEGY', icon: <Zap size={14} /> }];
  return (
    <div className="flex items-center justify-between w-full max-w-2xl mx-auto mb-12 px-4 print:hidden">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-col items-center gap-3 relative flex-1">
          {i !== 0 && <div className={`absolute right-[50%] top-5 w-full h-[1px] -z-10 ${i <= currentStep ? (isDeep ? 'bg-blue-500/50' : 'bg-purple-500/50') : 'bg-white/10'}`} />}
          <motion.div
            animate={{
              scale: i === currentStep ? 1.15 : 1,
              backgroundColor: i <= currentStep ? (isDeep ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)') : 'rgba(255,255,255,0.03)',
              borderColor: i <= currentStep ? (isDeep ? '#3b82f6' : '#a855f7') : 'rgba(255,255,255,0.1)'
            }}
            className="w-10 h-10 rounded-full border flex items-center justify-center backdrop-blur-md transition-all duration-300"
          >
            <div className={i <= currentStep ? (isDeep ? 'text-blue-400' : 'text-purple-400') : 'text-gray-600'}>
              {i < currentStep ? <CheckCircle2 size={16} /> : step.icon}
            </div>
          </motion.div>
          <span className={`text-[8px] font-bold tracking-[0.2em] ${i <= currentStep ? 'text-white' : 'text-gray-700'}`}>{step.name}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Tooltip for line/bar ─────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0a0a0a] border border-white/10 p-3 rounded-xl shadow-xl pointer-events-none" style={{ maxWidth: 180 }}>
        <p className="text-white text-xs font-bold mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs" style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Static charts for PDF ────────────────────────────────────
const StaticChartsForPrint = ({ chartData }: { chartData: any }) => {
  if (!chartData) return null;
  const { radar = [], marketGrowth = [], companyScores = [] } = chartData;
  const radarData = [
    { metric: 'Market Reach', ...Object.fromEntries(radar.map((r: any) => [r.company, r.marketReach ?? 0])) },
    { metric: 'Innovation',   ...Object.fromEntries(radar.map((r: any) => [r.company, r.innovation ?? 0])) },
    { metric: 'Growth',       ...Object.fromEntries(radar.map((r: any) => [r.company, r.growth ?? 0])) },
    { metric: 'Funding',      ...Object.fromEntries(radar.map((r: any) => [r.company, r.funding ?? 0])) },
    { metric: 'Risk Score',   ...Object.fromEntries(radar.map((r: any) => [r.company, 100 - (r.risk ?? 50)])) },
  ];
  return (
    <div style={{ width: '100%' }}>
      {radar.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#374151', marginBottom: 16, textTransform: 'uppercase' }}>
            Company Comparison Radar
          </h3>
          <RadarChart width={480} height={300} data={radarData}>
            <PolarGrid stroke="#d1d5db" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 9 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {radar.map((r: any, i: number) => (
              <Radar key={r.company} name={r.company} dataKey={r.company}
                stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}
                fillOpacity={0.12} strokeWidth={1.8} />
            ))}
          </RadarChart>

          {/* Color indicator legend below print chart */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 16, marginBottom: 24 }}>
            {radar.map((r: any, i: number) => (
              <div key={r.company} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                  backgroundColor: COLORS[i % COLORS.length],
                  WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact'
                }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{r.company}</span>
              </div>
            ))}
          </div>

          {/* Score table for PDF — all metrics, all companies */}
          <div style={{ marginTop: 20, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${radarData.length}, 1fr)`, backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#374151' }}>Company</div>
              {radarData.map(row => (
                <div key={row.metric} style={{ padding: '6px 6px', fontSize: 8, fontWeight: 700, color: '#374151', textAlign: 'center' }}>{row.metric}</div>
              ))}
            </div>
            {/* Data rows */}
            {radar.map((r: any, i: number) => (
              <div key={r.company} style={{
                display: 'grid', gridTemplateColumns: `140px repeat(${radarData.length}, 1fr)`,
                borderBottom: i < radar.length - 1 ? '1px solid #f3f4f6' : 'none',
                backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa'
              }}>
                <div style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS[i % COLORS.length], flexShrink: 0, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                  <span style={{ fontSize: 8, color: '#111827', fontWeight: 600 }}>{r.company}</span>
                </div>
                {radarData.map(row => (
                  <div key={row.metric} style={{ padding: '5px 6px', fontSize: 9, fontWeight: 700, color: '#1d4ed8', textAlign: 'center' }}>
                    {(row as any)[r.company] ?? 0}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {marketGrowth.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#374151', marginBottom: 16, textTransform: 'uppercase' }}>
            Market Growth Projection
          </h3>
          <LineChart width={480} height={180} data={marketGrowth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 3 }} name="Market Index" />
          </LineChart>
        </div>
      )}

      {companyScores.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#374151', marginBottom: 16, textTransform: 'uppercase' }}>
            Investment Score by Company
          </h3>
          <BarChart width={480} height={Math.max(180, companyScores.length * 28)} data={companyScores} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#374151', fontSize: 9 }} width={110} />
            <Bar dataKey="score" name="Score" radius={[0, 4, 4, 0]} fill="#3b82f6" />
          </BarChart>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
            {companyScores.map((c: any, i: number) => (
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ fontSize: 9, color: '#6b7280', marginBottom: 2 }}>{c.name}</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{c.score}<span style={{ fontSize: 10, color: '#9ca3af' }}>/100</span></p>
                <p style={{ fontSize: 9, color: '#3b82f6' }}>{c.category}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Interactive charts for web ───────────────────────────────
const ChartsPanel = ({ chartData }: { chartData: any }) => {
  const [activeMetric, setActiveMetric] = useState<string>('Market Reach');
  if (!chartData) return null;
  const { radar = [], marketGrowth = [], companyScores = [] } = chartData;

  const radarData = [
    { metric: 'Market Reach', ...Object.fromEntries(radar.map((r: any) => [r.company, r.marketReach ?? 0])) },
    { metric: 'Innovation',   ...Object.fromEntries(radar.map((r: any) => [r.company, r.innovation ?? 0])) },
    { metric: 'Growth',       ...Object.fromEntries(radar.map((r: any) => [r.company, r.growth ?? 0])) },
    { metric: 'Funding',      ...Object.fromEntries(radar.map((r: any) => [r.company, r.funding ?? 0])) },
    { metric: 'Risk Score',   ...Object.fromEntries(radar.map((r: any) => [r.company, 100 - (r.risk ?? 50)])) },
  ];
  const displayRow = radarData.find(d => d.metric === activeMetric) ?? radarData[0];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 print:hidden">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] text-gray-600 uppercase px-1">
        <TrendingUp size={14} className="text-blue-500" /> Visual Analytics
      </div>

      {/* Radar */}
      {radar.length > 0 && (
        <div className="bg-[#0f0f0f] border border-blue-500/20 p-6 rounded-2xl">
          <h3 className="text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-4">Company Comparison Radar</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.05)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 8 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              {radar.map((r: any, i: number) => (
                <Radar key={r.company} name={r.company} dataKey={r.company}
                  stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.07} strokeWidth={1.8} />
              ))}
            </RadarChart>
          </ResponsiveContainer>

          {/* Color legend — colored squares + names */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 mb-5">
            {radar.map((r: any, i: number) => (
              <div key={r.company} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[9px] text-gray-400">{r.company}</span>
              </div>
            ))}
          </div>

          {/* Metric selector */}
          <div className="border-t border-white/5 pt-4">
            <div className="flex flex-wrap gap-1.5 mb-4">
              {radarData.map((row) => (
                <button key={row.metric} onClick={() => setActiveMetric(row.metric)}
                  className={`px-2.5 py-1 rounded-lg text-[8px] font-bold tracking-wide transition-all ${
                    activeMetric === row.metric ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'
                  }`}>
                  {row.metric}
                </button>
              ))}
            </div>

            {/* Scores for selected metric */}
            <p className="text-[9px] text-blue-400 font-bold mb-3 uppercase tracking-widest">{activeMetric}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {radar.map((r: any, i: number) => (
                <div key={r.company} className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 min-w-0 mr-2">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[9px] truncate" style={{ color: COLORS[i % COLORS.length] }}>{r.company}</span>
                  </div>
                  <span className="text-[9px] font-bold text-white shrink-0">{(displayRow as any)[r.company] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Line */}
      {marketGrowth.length > 0 && (
        <div className="bg-[#0f0f0f] border border-blue-500/20 p-6 rounded-2xl">
          <h3 className="text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-4">Market Growth Projection</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={marketGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5}
                dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6, fill: '#60a5fa' }} name="Market Index" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bar */}
      {companyScores.length > 0 && (
        <div className="bg-[#0f0f0f] border border-blue-500/20 p-6 rounded-2xl">
          <h3 className="text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-4">Investment Score by Company</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, companyScores.length * 34)}>
            <BarChart data={companyScores} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false}
                width={Math.min(130, Math.max(80, ...companyScores.map((c: any) => (c.name?.length ?? 0) * 6)))} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="score" name="Score" radius={[0, 6, 6, 0]} fill="url(#barGrad2)" />
              <defs>
                <linearGradient id="barGrad2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {companyScores.map((c: any, i: number) => (
              <div key={i} className="bg-white/3 border border-white/5 p-3 rounded-xl">
                <p className="text-[9px] text-gray-500 truncate">{c.name}</p>
                <p className="text-lg font-bold text-white">{c.score}<span className="text-[10px] text-gray-600">/100</span></p>
                <p className="text-[9px] text-blue-400">{c.category}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ─── Main Page ───────────────────────────────────────────────
export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [deepResult, setDeepResult] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [activeView, setActiveView] = useState<'brief' | 'deep'>('brief');
  const [briefCompanies, setBriefCompanies] = useState<string[]>([]);
  const { placeholder: dynamicPlaceholder, isLive } = useDynamicPlaceholder();
  // ── Deep Progress hook (SSE-powered constellation loader) ──
  const { state: deepState, start: startDeep, progress: deepProgress, reset } = useDeepProgress();
  React.useEffect(() => {
    if (deepState.phase === "complete" && deepState.result) {
      setDeepResult(deepState.result);
      setActiveView('deep');
      setDeepLoading(false);
      // ✅ Reset the hook so the button can be clicked again
      setTimeout(() => reset(), 100);
    }
    if (deepState.phase === "error") {
      setDeepLoading(false);
      setTimeout(() => reset(), 100);
    }
  }, [deepState.phase, deepState.result]);

  const runAnalysis = async (endpoint: string, isDeep: boolean) => {
    if (!query) return;
    if (isDeep) { setDeepLoading(true); setDeepResult(null); }
    else { setLoading(true); setResult(null); setDeepResult(null); }
    setCurrentStep(0);
    setActiveView(isDeep ? 'deep' : 'brief');
    const t1 = setTimeout(() => setCurrentStep(1), isDeep ? 2000 : 1200);
    const t2 = setTimeout(() => setCurrentStep(2), isDeep ? 6000 : 3500);
    if (!isDeep) setBriefCompanies([]); // reset on new brief search
    try {
      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }), cache: 'no-store',
      });
      if (!response.ok) throw new Error("Backend connection failed");
      const data = await response.json();
      clearTimeout(t1); clearTimeout(t2);
      setCurrentStep(2);
      setTimeout(() => {
        setCurrentStep(3);
        if (isDeep) {
          setDeepResult(data);
          setDeepLoading(false);
        } else {
          // Show company chips first
          const names = (data.competitors ?? []).map((c: any) => c.name).slice(0, 3);
          setBriefCompanies(names);
          // Delay hiding RocketLoader so warp exit animation can play
          setTimeout(() => {
            setResult(data);
            setLoading(false);
          }, 4000);
        }
      }, 800);
    } catch (error) {
      console.error(error);
      alert("SynthOS Brain is offline! Check your FastAPI terminal.");
      setCurrentStep(-1); setLoading(false); setDeepLoading(false);
    }
  };

  const getCompanyUrl = (comp: any) => {
    if (comp.url?.startsWith('http')) return comp.url;
    return `https://www.google.com/search?q=${encodeURIComponent((comp.name || '') + ' startup official site')}`;
  };

  const isLoading = loading || deepLoading;
  const currentResult = activeView === 'deep' ? deepResult : result;
  const currentCompetitors = currentResult?.competitors || [];
  const isDeepView = activeView === 'deep';
  const hasCharts = isDeepView && deepResult?.chartData;
  const appState: AppState =
    deepLoading || (deepState.phase !== "idle" && deepState.phase !== "complete" && deepState.phase !== "error")
      ? "deep"
      : loading
      ? "brief"
      : isDeepView && deepResult
      ? "complete"
      : "idle";

  const cleanReportPayload = (rawReport: string) => {
    if (!rawReport) return "Agent synthesis failed.";
    // Remove "Report generated by SynthOS | X companies analyzed" line
    let cleaned = rawReport.replace(/\n*---\n\*Report generated by SynthOS[^\*]*\*/g, "");
    // Remove trailing horizontal rules
    cleaned = cleaned.replace(/(?:[\r\n\s]+(?:---|___|\*\*\*))+[\s]*$/g, "");
    return cleaned.trim();
  };

  return (
    <main className="min-h-screen bg-[#060606] text-white p-4 md:p-10 font-sans selection:bg-blue-500/30 overflow-x-hidden print:bg-white print:text-black print:p-8">
      {/* ── Neural Background (position: fixed, z-index: 0) ── */}
      <NeuralBackground appState={appState} />
      
      {/* ── Everything else sits above with higher z-index ── */}
      <div className="relative z-10 max-w-7xl mx-auto space-y-12">
        {/* ── Header ── */}
        <header className="flex justify-between items-center border-b border-white/5 pb-8 print:border-gray-200 print:mb-8">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold tracking-tighter relative z-20"
          >
            <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent print:text-black">Synth</span>
            <motion.span 
              animate={{ color: isDeepView ? '#3b82f6' : '#a855f7' }} 
              transition={{ duration: 0.4 }}
              style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
            >
              OS
            </motion.span>
          </motion.h1>
          <motion.div
            animate={{ borderColor: isDeepView ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.1)', color: isDeepView ? '#60a5fa' : '#6b7280' }}
            className="bg-white/5 border px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase print:hidden"
          >
            {deepLoading ? '🔬 Deep Scanning...' : loading ? 'Executing Protocol' : isDeepView ? 'Deep Mode' : 'Agent Idle'}
          </motion.div>

          {/* PDF header — SynthOS branding */}
          <div className="hidden print:flex flex-col items-end">
            <div className="flex items-baseline gap-0.5">
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Synth</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#2563eb' }}>OS</span>
            </div>
            <span style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
              Market Intelligence · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </header>

        {/* ── Search ── */}
        <section className="relative max-w-2xl mx-auto py-10 print:hidden">
          <motion.div
            animate={{ borderColor: isDeepView ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.1)' }}
            className="relative bg-[#0f0f0f] border p-2 rounded-2xl flex items-center shadow-2xl transition-all duration-500"
          >
            <Search className={`ml-4 transition-colors duration-300 ${isDeepView ? 'text-blue-600' : 'text-gray-600'}`} size={20} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runAnalysis('/analyze', false)}
              placeholder={dynamicPlaceholder || "Query market intelligence..."}
              className="bg-transparent w-full p-4 focus:outline-none text-base placeholder:text-gray-700" />
            
            {/* ✅ DYNAMIC ANALYZE BUTTON: Seamlessly transitions styling metrics based on active context theme layouts */}
            <button 
              onClick={() => runAnalysis('/analyze', false)} 
              disabled={isLoading}
              className={`disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 active:scale-95 ${
                isDeepView 
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/10' 
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/10'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
              {loading ? "DEPLOYING..." : "ANALYZE"}
            </button>
          </motion.div>
        </section>

        {/* ── Rocket Loader — brief report loading experience ── */}
        {loading && !deepLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{ position: "fixed", inset: 0, zIndex: 50 }}
          >
          <RocketLoader
              progress={
                currentStep === 0 ? 20 :
                currentStep === 1 ? 55 :
                currentStep === 2 ? 85 : 100
              }
              thought={
                currentStep === 0 ? "Scanning the web for market signals..." :
                currentStep === 1 ? "Analysing competitive landscape..." :
                "Synthesising intelligence report..."
              }
              isComplete={currentStep === 3}
              companies={briefCompanies}
            />
          </motion.div>
        )}

        {deepState.phase !== "idle" && deepState.phase !== "error" && (
          <>
            {/* Dark overlay behind constellation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: deepState.phase === "complete" ? 0 : 0.5 }}
              transition={{ duration: 0.4 }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 49,
                backgroundColor: "#000000",
                backdropFilter: "blur(12px)",
              }}
            />
            
            {/* Constellation with scale + fade */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: deepState.phase === "complete" ? 0 : 1,
                scale: deepState.phase === "complete" ? 1.1 : 1,
              }}
              transition={{ 
                duration: deepState.phase === "complete" ? 0.8 : 0.5, 
                ease: "easeInOut" 
              }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
              }}
            >
              <ConstellationLoader
                state={deepState}
                progress={deepProgress}
              />
            </motion.div>
          </>
        )}

        <AnimatePresence>
          {(result || deepResult) && !isLoading && (
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-24 print:pb-0">

              {/* Controls */}
              <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
                {result && deepResult && (
                  <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                    <button onClick={() => setActiveView('brief')}
                      className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[11px] font-bold tracking-widest transition-all ${activeView === 'brief' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-white'}`}>
                      <FileText size={13} /> BRIEF
                    </button>
                    <button onClick={() => setActiveView('deep')}
                      className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[11px] font-bold tracking-widest transition-all ${activeView === 'deep' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}>
                      <Microscope size={13} /> IN-DEPTH
                    </button>
                  </div>
                )}
                {result && !deepResult && (
                  <motion.button initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    onClick={() => {
                      setActiveView('deep');
                      startDeep(query);           // fires SSE — ConstellationLoader takes over
                    }} disabled={isLoading || deepState.phase !== "idle"}
                    className="flex items-center gap-3 bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-500/30 hover:border-blue-400/60 px-6 py-3 rounded-xl text-[11px] font-bold tracking-widest text-blue-400 hover:text-blue-300 transition-all group disabled:opacity-50">
                    <Microscope size={15} />
                    GENERATE IN-DEPTH ANALYSIS
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </motion.button>
                )}
                {(deepLoading || (deepState.phase !== "idle" && deepState.phase !== "complete")) && (
                  <div className="flex items-center gap-3 text-blue-400 text-[11px] font-bold tracking-widest">
                    <Loader2 size={15} className="animate-spin" /> GENERATING IN-DEPTH REPORT...
                  </div>
                )}
              </div>

              {/* Grid */}
              <div className={`grid gap-8 ${hasCharts ? 'grid-cols-1 xl:grid-cols-5' : 'grid-cols-1 lg:grid-cols-3'}`}>

                {/* Report Content Box */}
                <div className={`bg-[#0f0f0f] border p-8 md:p-12 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl overflow-hidden min-w-0 transition-all duration-500
                  print:bg-white print:text-black print:p-0 print:border-none print:shadow-none print:rounded-none
                  ${hasCharts ? 'xl:col-span-3' : 'lg:col-span-2'}
                  ${isDeepView ? 'border-blue-500/20' : 'border-white/10'}`}>
                  <div className="flex justify-between items-center mb-10 print:hidden">
                    <div className={`flex items-center gap-3 font-bold tracking-widest text-[10px] uppercase ${isDeepView ? 'text-blue-400' : 'text-purple-500'}`}>
                      {isDeepView ? <><Microscope size={16} /> In-Depth Intelligence</> : <><BarChart3 size={16} /> Intelligence Synthesis</>}
                    </div>
                    <button onClick={() => window.print()}
                      className="flex items-center gap-2 text-[10px] font-bold bg-white/5 border border-white/10 px-4 py-2 rounded-full hover:bg-white/10 transition-all active:scale-95">
                      <Download size={14} /> DOWNLOAD PDF
                    </button>
                  </div>

                  <div className="text-gray-400 leading-relaxed break-words print:text-black max-w-full">
                    <ReactMarkdown components={{
                      h1: ({...p}) => <h1 className="text-3xl font-bold text-white mb-8 mt-10 break-words print:text-black" {...p} />,
                      h2: ({...p}) => <h2 className={`text-xl font-bold text-white mb-6 mt-10 border-l-4 pl-4 break-words print:text-black print:border-gray-400 ${isDeepView ? 'border-blue-500' : 'border-purple-500'}`} {...p} />,
                      h3: ({...p}) => <h3 className={`text-sm font-bold mb-4 mt-8 uppercase tracking-[0.2em] print:text-gray-700 ${isDeepView ? 'text-blue-400' : 'text-purple-400'}`} {...p} />,
                      p:  ({...p}) => <p className="mb-6 text-gray-400 text-lg leading-8 break-words print:text-black" {...p} />,
                      strong: ({...p}) => <strong className="text-white font-semibold print:text-black" {...p} />,
                      ul: ({...p}) => <ul className="list-disc ml-6 space-y-4 mb-8 text-gray-400 print:text-black" {...p} />,
                      hr: ({...p}) => <hr className="border-white/10 my-10 print:border-gray-200" {...p} />,
                      code: ({...p}) => <code className="block bg-black/50 p-6 rounded-2xl border border-white/5 font-mono text-[11px] text-blue-400 my-6 overflow-x-auto whitespace-pre-wrap break-all print:bg-gray-100 print:text-black" {...p} />
                    }}>
                      {cleanReportPayload(currentResult?.report)}
                    </ReactMarkdown>

                    {/* UNIFIED CONTAINER CLOSING: Exactly 1 border line layout for both views */}
                    <div className="mt-12 border-t border-white/10 print:border-gray-200 pt-8 text-center">
                      
                      {/* Brief Mode Layout Layer */}
                      {!hasCharts && (
                        <>
                          <p className="text-sm text-gray-400 print:text-gray-500">
                            End of Market Report
                          </p>
                          {/* ✅ DYNAMIC FOOTER: Dynamically applies purple typography in brief view configurations */}
                          <div className="mt-4 text-xs font-bold tracking-[0.3em] uppercase text-purple-400 print:text-purple-600">
                            Powered by SynthOS
                          </div>
                        </>
                      )}

                      {/* In-Depth Mode Layout Layer */}
                      {hasCharts && (
                        <>
                          {/* Printable Layout */}
                          <div className="hidden print:block text-left">
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 24 }}>
                              <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>Synth</span>
                              <span style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>OS</span>
                              <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>Visual Analytics</span>
                            </div>
                            <StaticChartsForPrint chartData={deepResult.chartData} />
                            
                            <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
                              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontFamily: 'sans-serif' }}>
                                End of In-Depth Market Report
                              </p>
                              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#2563eb', marginTop: 12, fontFamily: 'sans-serif' }}>
                                Powered by SynthOS
                              </p>
                            </div>
                          </div>

                          {/* Web UI Layout */}
                          <div className="print:hidden">
                            <p className="text-sm text-gray-400">
                              End of In-Depth Market Report
                            </p>
                            {/* ✅ DYNAMIC FOOTER: Dynamically applies blue gradient topology in deep view configurations */}
                            <div className="mt-4 text-xs font-bold tracking-[0.3em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                              Powered by SynthOS
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6 print:hidden">
                  <div className="text-[10px] font-bold tracking-[0.3em] text-gray-600 flex items-center gap-2 px-2 uppercase">
                    <Database size={14} className={isDeepView ? 'text-blue-500' : 'text-purple-500'} />
                    {isDeepView ? `${currentCompetitors.length} Companies` : 'Vector Records'}
                  </div>
                  <div className="space-y-3">
                    {currentCompetitors.map((comp: any, i: number) => (
                      <motion.a key={`${activeView}-${i}`}
                        href={getCompanyUrl(comp)} target="_blank" rel="noopener noreferrer"
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={`block bg-[#0f0f0f] border p-5 rounded-2xl hover:scale-[1.02] transition-all duration-200 group overflow-hidden cursor-pointer ${
                          isDeepView ? 'border-white/8 hover:border-blue-500/50' : 'border-white/8 hover:border-purple-500/50'
                        }`}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className={`font-bold text-white text-sm transition-colors truncate pr-2 ${isDeepView ? 'group-hover:text-blue-400' : 'group-hover:text-purple-400'}`}>
                            {comp.name || "Unknown"}
                          </h4>
                          <div className="relative w-4 h-4 shrink-0">
                            <Globe size={14} className="absolute inset-0 text-gray-700 group-hover:opacity-0 transition-opacity" />
                            <ExternalLink size={14} className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDeepView ? 'text-blue-400' : 'text-purple-400'}`} />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed break-words line-clamp-2">{comp.description || "Data indexed."}</p>
                        <p className={`text-[9px] opacity-0 group-hover:opacity-60 transition-all mt-2 truncate font-mono ${isDeepView ? 'text-blue-500' : 'text-purple-500'}`}>
                          {comp.url?.startsWith('http') ? comp.url.replace(/^https?:\/\//, '') : `search: ${comp.name}`}
                        </p>
                      </motion.a>
                    ))}
                  </div>

                  {/* Core Engine */}
                  <div className={`p-6 rounded-[2rem] border transition-all duration-500 bg-gradient-to-b to-transparent ${isDeepView ? 'from-blue-500/5 border-blue-500/10' : 'from-purple-500/5 border-purple-500/10'}`}>
                    <div className={`flex items-center gap-3 mb-4 ${isDeepView ? 'text-blue-400' : 'text-purple-400'}`}>
                      <Cpu size={16} />
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Core Engine</span>
                    </div>
                    <div className="space-y-3">
                      {[
                        ['RAG (Milvus)', 'ACTIVE', false],
                        ['Search (n8n)', 'SYNCHRONIZED', false],
                        ['LLM (Groq)', 'ONLINE', true],
                        ['Embed (Ollama)', 'LOCAL', true],
                        ['Mode', isDeepView ? 'DEEP SCAN' : 'BRIEF', false],
                      ].map(([label, val, isGreen]) => (
                        <div key={String(label)} className="flex justify-between items-center text-[9px] border-b border-white/5 pb-2">
                          <span className="text-gray-500">{label}</span>
                          <span className={`font-mono tracking-tighter ${isGreen ? 'text-emerald-500' : isDeepView ? 'text-blue-500' : 'text-purple-500'}`}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Charts column */}
                {hasCharts && (
                  <div className="xl:col-span-1 print:hidden">
                    <ChartsPanel chartData={deepResult.chartData} />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}