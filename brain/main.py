import asyncio
import json
import re
import threading
import queue
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from concurrent.futures import ThreadPoolExecutor
from pydantic import BaseModel
import uvicorn

from app.graph import app as agent_brain
from app.graph import deep_app as deep_agent_brain

fastapi_app = FastAPI(title="Grand AI Agent API", version="3.1.0")
executor = ThreadPoolExecutor(max_workers=4)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str


def build_initial_state(query: str) -> dict:
    return {
        "messages": [{"role": "user", "content": query}],
        "research_data": "",
        "new_entities": [],
        "competitor_list": [],
        "market_trends": "",
        "final_report": ""
    }


def sanitize_competitors(competitors: list) -> list:
    return [
        {"name": c.get("name", "Unknown"), "description": c.get("description", ""), "url": c.get("url", "")}
        for c in competitors
    ]


def extract_chart_data(report: str):
    """
    Extracts chart data embedded in the report as:
    <!--CHART_DATA:{...}:CHART_DATA-->
    Returns (clean_report, chart_data_dict)
    """
    pattern = r'<!--CHART_DATA:(.*?):CHART_DATA-->'
    match = re.search(pattern, report, re.DOTALL)
    if match:
        try:
            chart_data = json.loads(match.group(1))
            clean_report = re.sub(pattern, '', report, flags=re.DOTALL).strip()
            return clean_report, chart_data
        except Exception as e:
            print(f"⚠️ Chart extraction error: {e}")
    return report, None


def _sse(event: str, data: dict) -> str:
    """Format a server-sent event string for streaming progress to frontend."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# --- BRIEF ENDPOINT ---
@fastapi_app.post("/analyze")
async def run_agent(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    try:
        print(f"\n🚀 Brief Mission: '{request.query}'")
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(executor, lambda: agent_brain.invoke(build_initial_state(request.query))),
                timeout=180.0
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Agent timed out.")

        report = result.get("final_report", "")
        competitors = sanitize_competitors(result.get("competitor_list", []))

        if not report or report.startswith("❌"):
            return {"report": "### ⚠️ Analysis Incomplete\nTry a more specific query.", "competitors": []}

        return {"report": report, "competitors": competitors}

    except HTTPException:
        raise
    except Exception as e:
        print(f"💥 Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Agent Error: {str(e)}")


# --- DEEP ENDPOINT ---
@fastapi_app.post("/analyze/deep")
async def run_deep_agent(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    try:
        print(f"\n🔬 Deep Mission: '{request.query}'")
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(executor, lambda: deep_agent_brain.invoke(build_initial_state(request.query))),
                timeout=300.0
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Deep analysis timed out.")

        raw_report = result.get("final_report", "")
        competitors = sanitize_competitors(result.get("competitor_list", []))

        # ✅ Extract chart data from report
        clean_report, chart_data = extract_chart_data(raw_report)

        if not clean_report or clean_report.startswith("❌"):
            return {"report": "### ⚠️ Deep Analysis Incomplete.", "competitors": [], "chartData": None}

        return {
            "report": clean_report,
            "competitors": competitors,
            "chartData": chart_data  # ✅ Sent to frontend separately
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"💥 Deep Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Agent Error: {str(e)}")

@fastapi_app.get("/analyze/deep/stream")
async def stream_deep_analysis(query: str):
    """
    SSE streaming endpoint for deep analysis.
    Emits progress events in real time so the frontend can show
    a live constellation/progress view instead of a blank wait.
    """
    if not query.strip():
        async def err():
            yield _sse("error", {"message": "Query cannot be empty."})
        return StreamingResponse(err(), media_type="text/event-stream")

    q: queue.Queue = queue.Queue()
    DONE_SENTINEL = "__DONE__"

    def run_pipeline():
        """Runs in a background thread — pipeline logic goes here in Step 3."""
        try:
            q.put(_sse("start", {"query": query}))
            # ⬅️ STEP 3 WILL FILL IN THE ACTUAL PIPELINE LOGIC HERE

            # ── Imports needed for pipeline logic ──────────────────
            from app.nodes import (
                call_data_sources,
                invoke_llm_with_retry,
                _company_exists_in_milvus,
                _ensure_collection,
                force_flatten,
                embeddings,
                milvus_client,
                collection_name,
                sensory,
            )
            import re as _re
            import json as _json
            import time as _time

            # ── PHASE 1: RECON ──────────────────────────────────────
            q.put(_sse("recon_start", {
                "thought": f"Scanning the web for signals across the {query} market..."
            }))

            raw_data = call_data_sources(query)

            extraction_prompt = (
                f"You are a market research analyst. Identify the top 8-10 most significant "
                f"companies, startups, or players for this market: '{query}'.\n\n"
                f"Reference data from web research:\n{raw_data[:6000]}\n\n"
                f"Rules:\n"
                f"- Include exactly 8-10 companies. Do NOT stop at 3 or 5.\n"
                f"- For url: direct company homepage only (e.g. https://stripe.com).\n"
                f"- If url unknown, construct best guess from company name.\n"
                f"- Return ONLY a valid JSON array. No markdown, no explanation.\n\n"
                f'Format: [{{"name":"CompanyName","description":"One sentence","url":"https://...","stage":"Series A / Public / etc","founded":"YYYY"}}]'
            )
            res_content = invoke_llm_with_retry(extraction_prompt)

            companies = []
            if res_content:
                try:
                    clean = _re.sub(r'```(?:json)?', '', res_content).strip()
                    arr_match = _re.search(r'\[[\s\S]*\]', clean)
                    if arr_match:
                        clean = arr_match.group(0)
                    parsed = _json.loads(clean)
                    companies = parsed if isinstance(parsed, list) else []
                except Exception as e:
                    print(f"⚠️ SSE recon parse error: {e}")

            # Knowledge top-up if fewer than 5 found
            if len(companies) < 5:
                q.put(_sse("thought", {
                    "text": "Cross-referencing additional intelligence sources..."
                }))
                topup_prompt = (
                    f"You are a market research expert with deep knowledge up to 2026.\n"
                    f"List the top 10 most well-known companies in this market: '{query}'.\n\n"
                    f"Use your own knowledge — do NOT say you cannot answer.\n"
                    f"Return ONLY a valid JSON array with exactly 10 entries. No markdown.\n\n"
                    f'Format: [{{"name":"CompanyName","description":"What the company does","url":"https://companydomain.com","stage":"Public/Private/Startup","founded":"YYYY"}}]'
                )
                topup_raw = invoke_llm_with_retry(topup_prompt)
                if topup_raw:
                    try:
                        clean2 = _re.sub(r'```(?:json)?', '', topup_raw).strip()
                        arr_match2 = _re.search(r'\[[\s\S]*\]', clean2)
                        if arr_match2:
                            clean2 = arr_match2.group(0)
                        parsed2 = _json.loads(clean2)
                        if isinstance(parsed2, list):
                            existing_names = {c.get('name', '').lower() for c in companies}
                            for c in parsed2:
                                if c.get('name', '').lower() not in existing_names:
                                    companies.append(c)
                                    existing_names.add(c.get('name', '').lower())
                            companies = companies[:10]
                    except Exception as e:
                        print(f"⚠️ SSE top-up parse error: {e}")

            # Emit each company as it's "found" — this drives the constellation UI
            for i, company in enumerate(companies):
                name = company.get('name', 'Unknown')
                q.put(_sse("company_found", {
                    "name": name,
                    "index": i,
                    "total": len(companies),
                    "description": company.get('description', ''),
                    "url": company.get('url', ''),
                    "thought": f"Found {name} — pulling funding and market data..."
                }))
                _time.sleep(0.3)  # small delay so frontend can animate each one appearing

            q.put(_sse("recon_done", {
                "companies": [c.get('name') for c in companies],
                "thought": f"Intelligence gathered on {len(companies)} companies."
            }))

            # ── PHASE 2: ANALYSIS / SYNTHESIS ────────────────────────
            q.put(_sse("analysis_start", {
                "thought": "Connecting the dots across all companies..."
            }))

            competitor_list = companies if companies else []
            comp_str = "\n".join([
                f"- **{c.get('name','N/A')}** ({c.get('url','')}): {c.get('description','N/A')}"
                for c in competitor_list
            ])

            section_prompts = [
                (
                    "Market Overview",
                    f"Write a detailed MARKET OVERVIEW for a 2026 intelligence report on: '{query}'.\n"
                    f"These {len(competitor_list)} companies are the key players: {comp_str}\n\n"
                    f"Cover: market size, CAGR, key drivers, geographic hotspots, regulatory environment, 2026 outlook.\n"
                    f"Reference all {len(competitor_list)} companies naturally in the text.\n"
                    f"Write 3-4 detailed paragraphs. Use markdown ## heading.",
                    "Mapping the market landscape and sizing the opportunity..."
                ),
                (
                    "Company Profiles",
                    f"Write KEY PLAYERS & COMPANY PROFILES for: '{query}'.\n"
                    f"Write a detailed profile for EACH of these {len(competitor_list)} companies — do not skip any:\n{comp_str}\n\n"
                    f"Cover per company: what they do, competitive advantage, target market, achievements, growth trajectory.\n"
                    f"Use markdown ## heading and ### for each company name.",
                    f"Building detailed profiles for all {len(competitor_list)} companies..."
                ),
                (
                    "Trends & Landscape",
                    f"Write MARKET TRENDS & COMPETITIVE LANDSCAPE for: '{query}'.\n"
                    f"Companies: {comp_str}\n\n"
                    f"Cover: top 5 trends, technology shifts, competitive dynamics, consolidation, barriers, disruptions.\n"
                    f"Use markdown ## heading and bullet points.",
                    "Identifying trends and competitive dynamics across the space..."
                ),
                (
                    "Risk & Recommendation",
                    f"Write RISK ANALYSIS & INVESTMENT RECOMMENDATION for: '{query}'.\n"
                    f"Rank ALL {len(competitor_list)} of these companies by investment potential:\n{comp_str}\n\n"
                    f"Cover: key risks (regulatory/tech/market), mitigation strategies, "
                    f"investment opportunities ranked from best to worst with scores, "
                    f"specific actionable recommendations, 2026-2028 outlook.\n"
                    f"Use markdown ## heading. Be specific and actionable.",
                    "Forming a view on who's positioned to win..."
                ),
            ]

            sections = []
            for i, (title, prompt, thought) in enumerate(section_prompts):
                q.put(_sse("section_start", {
                    "index": i + 1,
                    "title": title,
                    "thought": thought
                }))
                result = invoke_llm_with_retry(prompt)
                if result:
                    sections.append(result)
                    q.put(_sse("section_done", {
                        "index": i + 1,
                        "title": title,
                        "preview": result[:120] + "..."
                    }))

                    # ── PHASE 3: CHART DATA ───────────────────────────────────
            q.put(_sse("chart_start", {
                "thought": "Synthesising scores and building the visual intelligence layer..."
            }))

            from app.nodes import _generate_chart_data
            company_names = [c.get('name', 'Unknown') for c in competitor_list]
            chart_data = _generate_chart_data(company_names, query)

            q.put(_sse("chart_done", {"success": chart_data is not None}))

            # ── COMPLETE ──────────────────────────────────────────────
            if not sections:
                q.put(_sse("error", {"message": "Report generation failed — no sections produced."}))
            else:
                full_report = (
                    f"# 2026 In-Depth Market Intelligence Report\n"
                    f"## {query.title()}\n\n---\n\n"
                    + "\n\n---\n\n".join(sections)
                )

                clean_competitors = sanitize_competitors(competitor_list)

                q.put(_sse("complete_meta", {
                    "competitors": clean_competitors,
                    "chartData": chart_data,
                    "thought": "Your intelligence report is ready.",
                }))
                _time.sleep(0.05)  # let client process meta before large payload
                q.put(_sse("complete", {
                    "report": full_report,
                }))

        except Exception as e:
            print(f"💥 SSE pipeline error: {e}")
            q.put(_sse("error", {"message": str(e)}))
        finally:
            q.put(DONE_SENTINEL)

    thread = threading.Thread(target=run_pipeline, daemon=True)
    thread.start()

    async def event_generator():
        loop = asyncio.get_event_loop()
        while True:
            try:
                item = await loop.run_in_executor(executor, lambda: q.get(timeout=310))
            except Exception:
                break
            if item == DONE_SENTINEL:
                # Final comment frame — tells browser stream ended intentionally,
                # preventing it from treating normal close as a network error.
                yield ": done\n\n"
                break
            yield item

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "http://localhost:3000",
        }
    )


@fastapi_app.get("/health")
async def health_check():
    return {"status": "ok", "version": "3.1.0"}

# ── Add this to brain/main.py ─────────────────────────────────────────────────
# Place it after the /health endpoint, before the if __name__ == "__main__" block

import time as _time

# Cache so we don't hammer the search tool on every page load
_trending_cache: dict = {"queries": [], "fetched_at": 0}
TRENDING_TTL = 300  # seconds — refresh every 5 minutes


@fastapi_app.get("/trending-queries")
async def get_trending_queries():
    """
    Returns 8 trending market intelligence search queries.
    Calls the web_search sensory tool to find what's hot right now,
    then uses the LLM to reframe results as SynthOS-style queries.
    Cached for 5 minutes so it doesn't run on every keystroke.
    """
    global _trending_cache

    # Return cached result if still fresh
    if (
        _trending_cache["queries"]
        and _time.time() - _trending_cache["fetched_at"] < TRENDING_TTL
    ):
        return {"queries": _trending_cache["queries"], "source": "cache"}

    try:
        loop = asyncio.get_event_loop()

        def _fetch():
            from app.nodes import call_data_sources, invoke_llm_with_retry

            # Search for what's trending in startup / VC / tech markets right now
            raw = call_data_sources(
                "trending startup sectors venture capital hot markets 2025 2026"
            )

            prompt = (
                "You are SynthOS, a market intelligence AI.\n"
                "Based on this live web data, generate exactly 8 market research queries "
                "that a startup investor or founder would want to search RIGHT NOW in 2025-2026.\n\n"
                f"Web data:\n{raw[:4000]}\n\n"
                "Rules:\n"
                "- Each query must be 4-9 words\n"
                "- Cover a different sector each time (AI, climate, fintech, health, space, etc)\n"
                "- Sound like something a smart investor would actually search\n"
                "- Do NOT use generic phrases like 'market analysis' or 'industry overview'\n"
                "- Be specific: name technologies, trends, or dynamics\n"
                "- Return ONLY a JSON array of 8 strings. No markdown, no explanation.\n\n"
                'Example format: ["AI agents enterprise adoption 2026", "climate fintech carbon markets"]'
            )

            result = invoke_llm_with_retry(prompt)
            if not result:
                return []

            import re, json
            clean = re.sub(r"```(?:json)?", "", result).strip()
            match = re.search(r"\[[\s\S]*?\]", clean)
            if match:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, list) and len(parsed) >= 3:
                    return [str(q) for q in parsed[:8]]
            return []

        queries = await asyncio.wait_for(
            loop.run_in_executor(executor, _fetch),
            timeout=20.0,
        )

        if queries:
            _trending_cache = {"queries": queries, "fetched_at": _time.time()}
            return {"queries": queries, "source": "live"}

    except Exception as e:
        print(f"⚠️  Trending queries fetch failed: {e}")

    # Fallback — return curated seeds so the UI always has something
    fallback = [
        "AI infrastructure startups 2026",
        "climate tech venture landscape",
        "autonomous vehicles market leaders",
        "generative AI developer tools",
        "quantum computing investment landscape",
        "healthtech AI diagnostics players",
        "cybersecurity venture funding trends",
        "fintech disruption emerging markets",
    ]
    return {"queries": fallback, "source": "fallback"}


if __name__ == "__main__":
    uvicorn.run("main:fastapi_app", host="0.0.0.0", port=8000, reload=True)