import { useState, useEffect, useRef, useCallback } from "react";

// ─── Fallback seeds (used while fetch is loading or if it fails) ──────────────
const FALLBACK_QUERIES = [
  "AI infrastructure startups 2026",
  "climate tech venture landscape",
  "B2B SaaS competitive analysis",
  "autonomous vehicles market leaders",
  "generative AI developer tools",
  "quantum computing investment landscape",
  "space tech startup ecosystem",
  "fintech disruption in emerging markets",
  "healthtech AI diagnostics players",
  "cybersecurity venture funding trends",
];

// ─── How long each placeholder is visible before cycling ─────────────────────
const TYPE_MS  = 38;  // ms per character (typing speed)
const ERASE_MS = 18;  // ms per character (erase speed)
const PAUSE_MS = 900; // pause after fully typed before erasing

export function useDynamicPlaceholder() {
  const [placeholder, setPlaceholder] = useState("");
  const [queries, setQueries]         = useState<string[]>(FALLBACK_QUERIES);
  const [isFetching, setIsFetching]   = useState(false);
  const [isLive, setIsLive]           = useState(false);

  const indexRef     = useRef(0);
  const charRef      = useRef(0);
  const directionRef = useRef<"type" | "erase">("type");
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queriesRef   = useRef<string[]>(FALLBACK_QUERIES);
  
  // Keep ref updated without triggering re-renders inside the typewriter loop
  queriesRef.current = queries;

  // ── Fetch trending topics from backend ──────────────────────────────────────
  const fetchTrending = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetch("http://localhost:8000/trending-queries", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        // ✅ Increased to 25s so live MCP web search + LLM generation has time to complete
        signal: AbortSignal.timeout(25000), 
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.queries) && data.queries.length >= 3) {
          // Blend live queries with fallback seeds for variety
          const blended = [
            ...data.queries.slice(0, 8),
            ...FALLBACK_QUERIES.slice(0, 3),
          ];
          setQueries(blended);
          setIsLive(data.source === "live" || data.source === "cache");
        }
      }
    } catch (err) {
      console.warn("⚠️ Dynamic placeholder fetch timed out or failed — using fallbacks.");
      setIsLive(false);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // ── Typewriter loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const step = () => {
      const currentQuery = queriesRef.current[indexRef.current % queriesRef.current.length];

      if (directionRef.current === "type") {
        charRef.current += 1;
        setPlaceholder(currentQuery.slice(0, charRef.current));

        if (charRef.current >= currentQuery.length) {
          // Fully typed — pause then start erasing
          directionRef.current = "erase";
          timerRef.current = setTimeout(step, PAUSE_MS);
        } else {
          timerRef.current = setTimeout(step, TYPE_MS);
        }
      } else {
        // Erasing
        charRef.current -= 1;
        setPlaceholder(currentQuery.slice(0, charRef.current));

        if (charRef.current <= 0) {
          // Fully erased — move to next query
          directionRef.current = "type";
          indexRef.current     = (indexRef.current + 1) % queriesRef.current.length;
          charRef.current      = 0;
          timerRef.current = setTimeout(step, TYPE_MS * 2);
        } else {
          timerRef.current = setTimeout(step, ERASE_MS);
        }
      }
    };

    timerRef.current = setTimeout(step, 1200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Initial fetch + refresh trending topics every 5 minutes ────────────────
  useEffect(() => {
    fetchTrending();
    const interval = setInterval(fetchTrending, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTrending]);

  return { placeholder, isLive, isFetching };
}