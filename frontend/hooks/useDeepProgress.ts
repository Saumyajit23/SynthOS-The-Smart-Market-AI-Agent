import { useRef, useState, useCallback } from "react";

export type DeepProgressPhase =
  | "idle"
  | "recon"
  | "analysis"
  | "synthesis"
  | "complete"
  | "error";

export interface CompanyProgress {
  name: string;
  index: number;
  description: string;
  url: string;
  status: "found" | "scanning" | "done";
}

export interface SectionProgress {
  index: number;
  title: string;
  status: "pending" | "active" | "done";
  preview?: string;
}

export interface DeepProgressState {
  phase: DeepProgressPhase;
  thought: string;
  companies: CompanyProgress[];
  totalCompanies: number;
  sections: SectionProgress[];
  result: any | null;
  error: string | null;
  _meta?: { competitors: any[]; chartData: any } | null;
}

const INITIAL_STATE: DeepProgressState = {
  phase: "idle",
  thought: "",
  companies: [],
  totalCompanies: 0,
  sections: [
    { index: 1, title: "Market Overview", status: "pending" },
    { index: 2, title: "Company Profiles", status: "pending" },
    { index: 3, title: "Trends & Landscape", status: "pending" },
    { index: 4, title: "Risk & Recommendation", status: "pending" },
  ],
  result: null,
  error: null,
  _meta: null,
};

export function useDeepProgress() {
  const [state, setState] = useState<DeepProgressState>(INITIAL_STATE);
  const sourceRef = useRef<EventSource | null>(null);

  // FIX 1: Track completion in a ref (synchronous) so onerror guard
  // doesn't race against React's async setState batching.
  const didCompleteRef = useRef(false);

  const reset = useCallback(() => {
    didCompleteRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const start = useCallback(
    (query: string) => {
      stop();
      reset();

      setState((prev) => ({
        ...prev,
        phase: "recon",
        thought: "Initialising neural pathways...",
      }));

      const url = `http://localhost:8000/analyze/deep/stream?query=${encodeURIComponent(query)}`;
      const source = new EventSource(url);
      sourceRef.current = source;

      // ── PHASE 1: RECON ────────────────────────────────────────────

      source.addEventListener("start", () => {
        setState((prev) => ({ ...prev, phase: "recon" }));
      });

      source.addEventListener("recon_start", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, phase: "recon", thought: data.thought }));
      });

      source.addEventListener("thought", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, thought: data.text }));
      });

      source.addEventListener("company_found", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          thought: data.thought,
          totalCompanies: data.total,
          companies: [
            ...prev.companies,
            {
              name: data.name,
              index: data.index,
              description: data.description,
              url: data.url,
              status: "scanning" as const,
            },
          ],
        }));
      });

      source.addEventListener("recon_done", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          thought: data.thought,
          companies: prev.companies.map((c) => ({ ...c, status: "done" as const })),
        }));
      });

      // ── PHASE 2: ANALYSIS ─────────────────────────────────────────

      source.addEventListener("analysis_start", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          phase: "analysis",
          thought: data.thought,
        }));
      });

      source.addEventListener("section_start", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          thought: data.thought,
          sections: prev.sections.map((s) =>
            s.index === data.index ? { ...s, status: "active" as const } : s
          ),
        }));
      });

      source.addEventListener("section_done", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          sections: prev.sections.map((s) =>
            s.index === data.index
              ? { ...s, status: "done" as const, preview: data.preview }
              : s
          ),
        }));
      });

      // ── PHASE 3: SYNTHESIS / CHART ────────────────────────────────

      source.addEventListener("chart_start", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          phase: "synthesis",
          thought: data.thought,
        }));
      });

      source.addEventListener("chart_done", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          thought: data.success
            ? "Visual intelligence layer ready..."
            : "Finalising report...",
        }));
      });

      // ── FIX A: complete_meta arrives first (competitors + chartData) ──
      // This way if the report body is large, we already have the sidebar data.
      source.addEventListener("complete_meta", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          thought: data.thought ?? "Assembling final report...",
          _meta: {
            competitors: data.competitors ?? [],
            chartData: data.chartData ?? null,
          },
        }));
      });

      // ── COMPLETE ──────────────────────────────────────────────────

      source.addEventListener("complete", (e: MessageEvent) => {
        // FIX 1: Set ref synchronously BEFORE setState so onerror
        // reads it instantly without waiting for React to flush.
        didCompleteRef.current = true;

        let data: any = {};
        try {
          data = JSON.parse(e.data);
        } catch (err) {
          console.error("[SynthOS] Failed to parse complete payload:", err);
          setState((prev) => ({
            ...prev,
            phase: "error",
            error: "Report data corrupted in transit. Please try again.",
          }));
          stop();
          return;
        }

        setState((prev) => ({
          ...prev,
          phase: "complete",
          thought: data.thought ?? prev._meta?.chartData ? "Your intelligence report is ready." : "Report ready.",
          sections: prev.sections.map((s) => ({ ...s, status: "done" as const })),
          result: {
            // FIX A: report body comes in "complete", meta came in "complete_meta"
            report: data.report,
            competitors: data.competitors ?? prev._meta?.competitors ?? [],
            chartData: data.chartData ?? prev._meta?.chartData ?? null,
          },
        }));

        // FIX 3: Delay close by 150ms so React commits state before
        // EventSource fires its CLOSED onerror.
        const thisSource = source;
        setTimeout(() => {
          if (sourceRef.current === thisSource) {
            thisSource.close();
            sourceRef.current = null;
          }
        }, 150);
      });

      // ── NATIVE onerror ────────────────────────────────────────────
      // FIX 1: Use the synchronous ref to distinguish:
      //   - Normal stream end after complete → ignore
      //   - Real crash mid-stream → show error
      //   - Browser auto-retry (CONNECTING) → let it retry

      source.onerror = (e: Event) => {
        const src = e.target as EventSource;

        // Complete already arrived — this is just the stream closing cleanly.
        if (didCompleteRef.current) {
          return;
        }

        if (src.readyState === EventSource.CLOSED) {
          // Stream closed without complete — pipeline crashed or timed out.
          setState((prev) =>
            prev.phase === "complete"
              ? prev
              : {
                  ...prev,
                  phase: "error",
                  error:
                    "SynthOS lost connection mid-analysis. The backend may have timed out. Please try again.",
                }
          );
          stop();
          return;
        }

        // readyState CONNECTING = browser is auto-retrying — let it.
        // The backend's 310s timeout will close cleanly if needed.
      };

      return source;
    },
    [reset, stop]
  );

  // Derived progress percentage
  const progress = (() => {
    const { phase, companies, totalCompanies, sections } = state;
    if (phase === "idle") return 0;
    if (phase === "complete") return 100;

    const reconShare =
      totalCompanies > 0
        ? (companies.length / totalCompanies) * 30
        : phase === "recon"
        ? 5
        : 30;

    const doneSections = sections.filter((s) => s.status === "done").length;
    const activeSections = sections.filter((s) => s.status === "active").length;
    const analysisPhases: DeepProgressPhase[] = ["analysis", "synthesis"];
    const analysisShare = analysisPhases.includes(phase)
      ? doneSections * 13.75 + activeSections * 6
      : 0;

    const synthesisShare = phase === "synthesis" ? 10 : 0;

    return Math.min(Math.round(reconShare + analysisShare + synthesisShare), 95);
  })();

  return { state, start, stop, reset, progress };
}