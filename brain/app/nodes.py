import os
import requests
import json
import re
import time
import numpy as np
from dotenv import load_dotenv
from pymilvus import MilvusClient, DataType
from langchain_ollama import OllamaEmbeddings
from langchain_groq import ChatGroq

# ✅ MCP sensory layer — replaces hardcoded n8n + DuckDuckGo calls
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from sensory.client import sensory

try:
    from app.state import AgentState
except ImportError:
    from state import AgentState

load_dotenv()

# --- 1. MILVUS SETUP ---
import os
MILVUS_HOST = os.getenv("MILVUS_HOST", "milvus")
MILVUS_PORT = os.getenv("MILVUS_PORT", "19530")

# Retry connection loop to avoid startup race conditions with Milvus container
milvus_client = None
for attempt in range(10):
    try:
        milvus_client = MilvusClient(uri=f"http://{MILVUS_HOST}:{MILVUS_PORT}")
        break
    except Exception:
        print(f"⏳ Waiting for Milvus database to boot (Attempt {attempt+1}/10)...")
        time.sleep(3)

if not milvus_client:
    raise RuntimeError("❌ Failed to connect to Milvus after 30 seconds.")

collection_name = "grand_ai_knowledge"


# ── Schema version — bump this string whenever you change fields or indexes ──
SCHEMA_VERSION = "synthos_v3"


def _create_collection():
    """Creates collection with current schema. Version tag stored in description."""
    schema = milvus_client.create_schema(
        auto_id=True,
        enable_dynamic_field=True,
        description=SCHEMA_VERSION  # ✅ version fingerprint stored here
    )
    schema.add_field("id", DataType.INT64, is_primary=True, auto_id=True)
    schema.add_field("vector", DataType.FLOAT_VECTOR, dim=768)
    schema.add_field("name", DataType.VARCHAR, max_length=256)
    schema.add_field("description", DataType.VARCHAR, max_length=2048)
    schema.add_field("url", DataType.VARCHAR, max_length=1024)
    schema.add_field("source_query", DataType.VARCHAR, max_length=512)

    index_params = milvus_client.prepare_index_params()
    index_params.add_index(
        field_name="vector",
        index_type="IVF_FLAT",
        metric_type="COSINE",
        params={"nlist": 128}
    )
    # ✅ No Trie index — this was the root cause of all previous errors

    milvus_client.create_collection(
        collection_name=collection_name,
        schema=schema,
        index_params=index_params
    )
    print(f"✅ Collection created fresh [{SCHEMA_VERSION}].")


def _ensure_collection():
    """
    Versioned schema manager.
    - If collection doesn't exist → create it fresh
    - If collection exists with matching version → keep all data (memory preserved)
    - If collection exists with old version → auto-migrate (drop + recreate)
    
    To trigger a migration: just bump SCHEMA_VERSION above.
    Never need to manually drop collections again.
    """
    if milvus_client.has_collection(collection_name):
        try:
            info = milvus_client.describe_collection(collection_name)
            current_version = info.get("description", "unknown")

            if current_version == SCHEMA_VERSION:
                print(f"✅ Collection schema OK [{SCHEMA_VERSION}] — memory preserved.")
                return  # ✅ Perfect — keep existing data, skip recreation
            else:
                print(f"⚠️  Schema version mismatch: '{current_version}' → '{SCHEMA_VERSION}'")
                print(f"🔄 Auto-migrating collection...")
                milvus_client.drop_collection(collection_name)

        except Exception as e:
            print(f"⚠️  Could not verify schema version ({e}). Recreating to be safe...")
            try:
                milvus_client.drop_collection(collection_name)
            except Exception:
                pass

    _create_collection()

_ensure_collection()

# --- 2. EMBEDDINGS ---
ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
embeddings = OllamaEmbeddings(
    model="nomic-embed-text",
    base_url=ollama_url
)


def force_flatten(v):
    return np.array(v).flatten().tolist()


# --- 3. LLM ---
def get_llm():
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise ValueError("GROQ_API_KEY not found in .env")
    return ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=groq_key,
        temperature=0.2
    )


def invoke_llm_with_retry(prompt: str, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            llm = get_llm()
            res = llm.invoke(prompt)
            return str(res.content) if hasattr(res, 'content') else str(res)
        except Exception as e:
            if "429" in str(e):
                wait = (attempt + 1) * 10
                print(f"⏳ Groq rate limit. Waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"❌ LLM error: {e}")
                return ""
    return ""


def get_query_from_state(state: AgentState) -> str:
    messages = state.get("messages", [])
    last_msg = messages[-1]
    query = last_msg.get("content") if isinstance(last_msg, dict) else (
        last_msg.content if hasattr(last_msg, "content") else str(last_msg)
    )
    return str(query).strip()


def call_data_sources(query: str) -> str:
    """
    ✅ MCP-powered data fetcher.
    Replaces call_n8n() + call_duckduckgo_fallback().
    
    Priority:
    1. MCP web_search tool (DuckDuckGo via sensory layer)
    2. MCP news_feed tool (latest startup news)
    3. Empty string fallback (LLM uses its own knowledge)
    """
    print("🧠 MCP: Fetching via sensory layer...")

    combined_parts = []

    # --- Source 1: Web Search ---
    try:
        search_result = sensory.search_sync(
            query=f"{query} startup company 2026",
            max_results=10
        )
        if search_result.get("status") == "success":
            results = search_result.get("results", [])
            formatted = []
            for r in results:
                formatted.append(
                    f"TITLE: {r.get('title', '')}\n"
                    f"DESCRIPTION: {r.get('snippet', '')}\n"
                    f"URL: {r.get('url', '')}\n---"
                )
            web_text = "\n".join(formatted)
            combined_parts.append(f"[WEB SEARCH RESULTS]\n{web_text}")
            print(f"✅ MCP web_search: {len(results)} results")
        else:
            print(f"⚠️ MCP web_search empty/failed: {search_result.get('status')}")
    except Exception as e:
        print(f"⚠️ MCP web_search error: {e}")

    # --- Source 2: News Feed ---
    try:
        news_result = sensory.news_sync(
            query=f"{query} startup funding 2026",
            max_results=6
        )
        if news_result.get("status") == "success":
            articles = news_result.get("articles", [])
            formatted_news = []
            for a in articles:
                formatted_news.append(
                    f"HEADLINE: {a.get('title', '')}\n"
                    f"SUMMARY: {a.get('summary', '')}\n"
                    f"SOURCE: {a.get('source', '')} | {a.get('published', '')}\n"
                    f"URL: {a.get('url', '')}\n---"
                )
            news_text = "\n".join(formatted_news)
            combined_parts.append(f"[LATEST NEWS]\n{news_text}")
            print(f"✅ MCP news_feed: {len(articles)} articles")
        else:
            print(f"⚠️ MCP news_feed empty/failed: {news_result.get('status')}")
    except Exception as e:
        print(f"⚠️ MCP news_feed error: {e}")

    if combined_parts:
        combined = "\n\n".join(combined_parts)
        print(f"✅ MCP total data: {len(combined)} chars from {len(combined_parts)} sources")
        return combined

    # --- Final fallback ---
    print("⚠️ All MCP sources failed — LLM will use internal knowledge")
    return ""


def _company_exists_in_milvus(name: str, query: str) -> bool:
    """Check if a company already exists for this query before inserting."""
    try:
        results = milvus_client.query(
            collection_name=collection_name,
            filter=f'name == "{name}" && source_query == "{query}"',
            output_fields=["name"],
            limit=1
        )
        return len(results) > 0
    except Exception:
        return False  # If check fails, allow insert


def clean_markdown_formatting(text: str) -> str:
    """
    Fixes model compression artifacts where table rows are concatenated on single lines
    using '||' or '| |', and fixes spacing around tables so Markdown parsers render them properly.
    """
    if not text:
        return ""
    # Break concatenated table rows into proper newlines: '| |' or '||' -> '|\n|'
    text = re.sub(r'\|\s*\|', '|\n|', text)
    # Ensure there is a blank line before any table header so Markdown parsers identify the block
    text = re.sub(r'([^\n])\n(\|[^\n]+\|)\n(\|[-:\s|]+\|)', r'\1\n\n\2\n\3', text)
    return text.strip()


# ============================================================
# BRIEF NODES
# ============================================================

def research_node(state: AgentState) -> dict:
    """RESEARCHER: Finds top 3 startups, stores in Milvus."""
    print("---NODE: RESEARCHER (Brief)---")
    query = get_query_from_state(state)
    raw_data = call_data_sources(query)

    extraction_prompt = (
            f"You are a market research analyst. Identify EXACTLY 3 companies, startups, "
            f"or organizations related to this market: '{query}'.\n\n"
            f"Reference data:\n{raw_data[:3500]}\n\n"
            f"STRICT RULES:\n"
            f"- You MUST return EXACTLY 3 entries. Never 1, never 2, always 3.\n"
            f"- If you cannot find 3 from the data, use your own knowledge to complete the list.\n"
            f"- For url: direct company homepage only (e.g. https://nike.com). Never news or LinkedIn.\n"
            f"- If url unknown, construct best guess (e.g. https://companyname.com).\n"
            f"- Return ONLY a valid JSON array. No markdown, no explanation, no extra text.\n\n"
            f"Format (exactly 3 entries required):\n"
            f'[{{"name":"CompanyName","description":"One sentence what they do","url":"https://..."}},'
            f'{{"name":"CompanyName","description":"One sentence what they do","url":"https://..."}},'
            f'{{"name":"CompanyName","description":"One sentence what they do","url":"https://..."}}]'
        )
    res_content = invoke_llm_with_retry(extraction_prompt)

    new_found_startups = []
    if res_content:
        try:
            clean_json = re.sub(r'```(?:json)?', '', res_content).strip()
            # Find the first [ and its matching ] using bracket counting
            start = clean_json.find('[')
            if start != -1:
                depth = 0
                end = -1
                for idx in range(start, len(clean_json)):
                    if clean_json[idx] == '[':
                        depth += 1
                    elif clean_json[idx] == ']':
                        depth -= 1
                        if depth == 0:
                            end = idx + 1
                            break
                if end != -1:
                    clean_json = clean_json[start:end]
            
            # First attempt
            try:
                parsed = json.loads(clean_json)
                new_found_startups = parsed if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                # JSON is malformed — ask LLM to fix it directly
                print(f"⚠️ JSON malformed — running repair prompt...")
                repair_prompt = (
                    f"The following JSON is malformed. Fix it and return ONLY valid JSON.\n"
                    f"It must be an array of exactly 3 objects with name, description, url fields.\n"
                    f"Malformed JSON:\n{clean_json}\n\n"
                    f"Return ONLY the fixed JSON array. No explanation."
                )
                repaired = invoke_llm_with_retry(repair_prompt)
                if repaired:
                    repaired_clean = re.sub(r'```(?:json)?', '', repaired).strip()
                    r_start = repaired_clean.find('[')
                    r_end = repaired_clean.rfind(']')
                    if r_start != -1 and r_end != -1:
                        repaired_clean = repaired_clean[r_start:r_end+1]
                    parsed2 = json.loads(repaired_clean)
                    new_found_startups = parsed2 if isinstance(parsed2, list) else []
                else:
                    new_found_startups = []

            insert_batch = []
            _ensure_collection()
            for s in new_found_startups:
                name = str(s.get('name', 'Unknown'))
                desc = str(s.get('description', ''))
                url = str(s.get('url', ''))
                # ✅ Skip if already stored for this query
                if _company_exists_in_milvus(name, query):
                    print(f"⏭️ Skipping duplicate: {name}")
                    continue
                # ✅ Enrich with Crunchbase funding data
                cb_data = sensory.crunchbase_sync(name)
                if cb_data.get("status") == "success":
                    s["funding_data"] = cb_data.get("raw_data", "")
                    s["crunchbase_url"] = cb_data.get("crunchbase_url", "")
                    s["data_source"] = cb_data.get("source", "")
                    desc = desc + " | Funding: " + cb_data.get("raw_data", "")[:300]

                vector = force_flatten(embeddings.embed_query(f"{name}: {desc}"))[:768]
                insert_batch.append({
                    "vector": vector,
                    "name": name,
                    "description": desc,
                    "url": url,
                    "source_query": query
                })

            if insert_batch:
                _ensure_collection()
                milvus_client.insert(collection_name=collection_name, data=insert_batch)
                print(f"✅ Stored {len(insert_batch)} entities")

        except Exception as e:
            print(f"⚠️ Research error: {e}")

    return {"new_entities": new_found_startups}


def analysis_node(state: AgentState) -> dict:
    """
    ANALYST (Brief): Uses freshly researched entities FIRST.
    Only falls back to Milvus if research found nothing this turn,
    and even then filters Milvus results to the current query only
    (never returns companies from a different, unrelated search).
    """
    print("---NODE: ANALYST (Brief)---")
    query_text = get_query_from_state(state)

    # ✅ PRIORITY 1: fresh entities from this exact query
    new_entities = state.get("new_entities", [])
    if new_entities:
        competitors = new_entities[:3]
        print(f"✅ Brief analyst using {len(competitors)} fresh entities from this query")
        return {"competitor_list": competitors}

    # ✅ FALLBACK: only if research found nothing — filter Milvus by source_query
    competitors = []
    try:
        _ensure_collection()
        milvus_client.load_collection(collection_name)
        results = milvus_client.query(
            collection_name=collection_name,
            filter=f'source_query == "{query_text}"',
            output_fields=["name", "description", "url", "source_query"],
            limit=3
        )
        competitors = results if results else []
        print(f"🔄 Milvus fallback (filtered to this query): {len(competitors)} entities")
    except Exception as e:
        print(f"⚠️ Analyst Milvus error: {e}")

    print(f"✅ Brief analyst returning {len(competitors)} companies")
    return {"competitor_list": competitors}

def synthesis_node(state: AgentState) -> dict:
    """STRATEGIST: Writes brief 1-page market report."""
    print("---NODE: STRATEGIST (Brief)---")

    comp_list = state.get('competitor_list', [])
    query_text = get_query_from_state(state)

    if not comp_list:
        return {"final_report": "⚠️ No companies found. Try a more specific query."}

    comp_str = "\n".join([
        f"- **{c.get('name', 'N/A')}**: {c.get('description', 'N/A')}"
        for c in comp_list
    ])

    report_content = invoke_llm_with_retry(
        f"Write a concise 2026 market intelligence report for: '{query_text}'.\n"
        f"Base it on: {comp_str}\n\n"
        f"Include: market overview, key players, trends, recommendation.\n"
        f"Keep it concise. Use markdown."
    )
    cleaned_report = clean_markdown_formatting(report_content)
    print("✅ Brief report generated")
    return {"final_report": cleaned_report if cleaned_report else "❌ Report generation failed."}


# ============================================================
# DEEP NODES
# ============================================================

def deep_research_node(state: AgentState) -> dict:
    """
    DEEP RESEARCHER: Finds top 8-10 companies.

    FIX 1: raw_data window increased from 3500 → 6000 chars so the
            LLM sees enough web data to identify 10 companies.
    FIX 2: JSON array extracted with regex fallback so even if the LLM
            wraps it in prose the parse still succeeds.
    FIX 3: If first parse yields < 5 companies, a second LLM call is
            made with an explicit knowledge-based prompt (no n8n data
            required) to top up to 10.
    """
    print("---NODE: DEEP RESEARCHER---")
    query = get_query_from_state(state)
    raw_data = call_data_sources(query)

    # ── Attempt 1: extract from n8n data ────────────────────────────
    extraction_prompt = (
        f"You are a market research analyst. Identify the top 8-10 most significant "
        f"companies, startups, or players for this market: '{query}'.\n\n"
        f"Reference data from web research:\n{raw_data[:6000]}\n\n"
        f"Rules:\n"
        f"- Include exactly 8-10 companies. Do NOT stop at 3 or 5.\n"
        f"- For url: direct company homepage only (e.g. https://stripe.com).\n"
        f"- If url unknown, construct best guess from company name.\n"
        f"- Return ONLY a valid JSON array. No markdown, no explanation.\n\n"
        f"Format (every field required):\n"
        f'[{{"name":"CompanyName","description":"One sentence description of what they do","url":"https://...","stage":"Series A / Public / etc","founded":"YYYY"}}]'
    )
    res_content = invoke_llm_with_retry(extraction_prompt)

    companies = []
    if res_content:
        try:
            clean = re.sub(r'```(?:json)?', '', res_content).strip()
            # Regex fallback: grab the JSON array even if LLM adds prose
            start = clean.find('[')
            if start != -1:
                depth = 0
                end = -1
                for idx in range(start, len(clean)):
                    if clean[idx] == '[':
                        depth += 1
                    elif clean[idx] == ']':
                        depth -= 1
                        if depth == 0:
                            end = idx + 1
                            break
                if end != -1:
                    clean = clean[start:end]
            parsed = json.loads(clean)
            companies = parsed if isinstance(parsed, list) else []
            print(f"✅ Attempt 1 extracted {len(companies)} companies")
        except Exception as e:
            print(f"⚠️ Deep research attempt 1 parse error: {e}")

    # ── Attempt 2: knowledge-based top-up if < 5 companies found ────
    if len(companies) < 5:
        print(f"⚠️ Only {len(companies)} companies found — running knowledge top-up...")
        topup_prompt = (
            f"You are a market research expert with deep knowledge up to 2026.\n"
            f"List the top 10 most well-known companies in this market: '{query}'.\n\n"
            f"Use your own knowledge — do NOT say you cannot answer.\n"
            f"Return ONLY a valid JSON array with exactly 10 entries. No markdown.\n\n"
            f"Format:\n"
            f'[{{"name":"CompanyName","description":"What the company does in one sentence","url":"[https://companydomain.com](https://companydomain.com)","stage":"Public/Private/Startup","founded":"YYYY"}}]'
        )
        topup_raw = invoke_llm_with_retry(topup_prompt)
        if topup_raw:
            try:
                clean2 = re.sub(r'```(?:json)?', '', topup_raw).strip()
                arr_match2 = re.search(r'\[[\s\S]*\]', clean2)
                if arr_match2:
                    clean2 = arr_match2.group(0)
                parsed2 = json.loads(clean2)
                if isinstance(parsed2, list) and len(parsed2) > 0:
                    # Merge: keep existing, add new ones not already in list
                    existing_names = {c.get('name', '').lower() for c in companies}
                    for c in parsed2:
                        if c.get('name', '').lower() not in existing_names:
                            companies.append(c)
                            existing_names.add(c.get('name', '').lower())
                    companies = companies[:10]  # cap at 10
                    print(f"✅ After top-up: {len(companies)} companies total")
            except Exception as e:
                print(f"⚠️ Top-up parse error: {e}")

    # ── Store all found companies in Milvus ──────────────────────────
    if companies:
        insert_batch = []
        _ensure_collection()
        for s in companies:
            name = str(s.get('name', 'Unknown'))
            desc = str(s.get('description', ''))
            url = str(s.get('url', ''))
            # ✅ Skip if already stored for this query
            if _company_exists_in_milvus(name, query):
                print(f"⏭️ Skipping duplicate: {name}")
                continue
            try:
                # ✅ Enrich with Crunchbase funding data
                cb_data = sensory.crunchbase_sync(name)
                if cb_data.get("status") == "success":
                    s["funding_data"] = cb_data.get("raw_data", "")
                    s["crunchbase_url"] = cb_data.get("crunchbase_url", "")
                    s["data_source"] = cb_data.get("source", "")
                    desc = desc + " | Funding: " + cb_data.get("raw_data", "")[:300]

                vector = force_flatten(embeddings.embed_query(f"{name}: {desc}"))[:768]
                insert_batch.append({
                    "vector": vector,
                    "name": name,
                    "description": desc,
                    "url": url,
                    "source_query": query
                })
            except Exception as e:
                print(f"⚠️ Embedding error for {name}: {e}")

        if insert_batch:
            try:
                _ensure_collection()
                milvus_client.insert(collection_name=collection_name, data=insert_batch)
                print(f"✅ Deep stored {len(insert_batch)} entities in Milvus")
            except Exception as e:
                print(f"⚠️ Milvus insert error: {e}")

    print(f"✅ Deep researcher returning {len(companies)} companies")
    return {"new_entities": companies}


def deep_analysis_node(state: AgentState) -> dict:
    """
    DEEP ANALYST: Passes all fresh entities through.
    Milvus fallback is filtered to the current query's source_query only,
    so a fallback can never pull in companies from a different, unrelated
    search that happened to embed nearby in vector space.
    """
    print("---NODE: DEEP ANALYST---")

    new_entities = state.get("new_entities", [])
    if new_entities:
        print(f"🧠 Deep analyst passing {len(new_entities)} fresh entities to strategist")
        return {"competitor_list": new_entities}  # No [:3] cap — pass ALL

    # Fallback to Milvus only if researcher returned nothing —
    # filtered strictly to this exact query, never cross-query similarity.
    query_text = get_query_from_state(state)
    competitors = []
    try:
        _ensure_collection()
        milvus_client.load_collection(collection_name)
        results = milvus_client.query(
            collection_name=collection_name,
            filter=f'source_query == "{query_text}"',
            output_fields=["name", "description", "url", "source_query"],
            limit=10
        )
        competitors = results if results else []
        print(f"🧠 Milvus fallback (filtered to this query): {len(competitors)} entities")
    except Exception as e:
        print(f"❌ Deep analyst Milvus error: {e}")

    return {"competitor_list": competitors}

def _generate_chart_data(company_names: list, query_text: str) -> dict | None:
    """
    Generates chart data for the 3 visual panels.
    Retries up to 3 times with progressively simpler prompts.
    """
    names_str = ", ".join(company_names)

    chart_prompt = f"""You are a data analyst. Generate chart data for these companies in the '{query_text}' market.
Companies: {names_str}

Return ONLY a valid JSON object. No markdown, no explanation, no extra text before or after.
Scores are integers 0-100 based on your knowledge of these companies.

Required JSON structure (one entry per company listed above — all {len(company_names)} of them):
{{
  "radar": [
    {{"company": "CompanyName", "marketReach": 85, "innovation": 90, "growth": 75, "funding": 80, "risk": 40}}
  ],
  "marketGrowth": [
    {{"year": "2022", "value": 100}},
    {{"year": "2023", "value": 140}},
    {{"year": "2024", "value": 190}},
    {{"year": "2025", "value": 260}},
    {{"year": "2026", "value": 340}},
    {{"year": "2027", "value": 430}},
    {{"year": "2028", "value": 540}}
  ],
  "companyScores": [
    {{"name": "CompanyName", "score": 85, "category": "Market Leader"}}
  ]
}}"""

    for attempt in range(3):
        raw = invoke_llm_with_retry(chart_prompt)
        if not raw:
            print(f"⚠️ Chart attempt {attempt+1}: empty LLM response")
            continue

        clean = re.sub(r'```(?:json)?', '', raw).strip()
        json_match = re.search(r'\{[\s\S]*\}', clean)
        if json_match:
            clean = json_match.group(0)

        try:
            data = json.loads(clean)

            if not all(k in data for k in ("radar", "marketGrowth", "companyScores")):
                print(f"⚠️ Chart attempt {attempt+1}: missing keys — {list(data.keys())}")
                continue

            if not isinstance(data["radar"], list) or len(data["radar"]) == 0:
                print(f"⚠️ Chart attempt {attempt+1}: radar empty")
                continue

            print(f"✅ Chart data generated — {len(data['radar'])} radar entries, "
                  f"{len(data['marketGrowth'])} growth points, "
                  f"{len(data['companyScores'])} scores")
            return data

        except json.JSONDecodeError as e:
            print(f"⚠️ Chart attempt {attempt+1}: JSON parse error — {e}")
            chart_prompt = (
                f"Return ONLY valid JSON. No markdown. No explanation.\n"
                f"Companies: {names_str}\n"
                f"JSON must have keys: radar (array with company/marketReach/innovation/growth/funding/risk for ALL {len(company_names)} companies), "
                f"marketGrowth (array with year/value for 2022-2028), "
                f"companyScores (array with name/score/category for ALL {len(company_names)} companies).\n"
                f"Use integer scores 0-100."
            )
            time.sleep(2)

    print("❌ Chart data generation failed after 3 attempts")
    return None


def deep_synthesis_node(state: AgentState) -> dict:
    """
    DEEP STRATEGIST: Generates 4-section report + chart data.
    All companies are included in every section.
    """
    print("---NODE: DEEP STRATEGIST---")

    comp_list = state.get('competitor_list', [])
    query_text = get_query_from_state(state)

    if not comp_list:
        return {"final_report": "⚠️ No companies found for deep analysis."}

    print(f"📋 Generating deep report for {len(comp_list)} companies")

    comp_str = "\n".join([
        f"- **{c.get('name','N/A')}** ({c.get('url','')}): {c.get('description','N/A')}"
        for c in comp_list
    ])
    company_names = [c.get('name', 'Unknown') for c in comp_list]

    sections = []

    print("📝 Section 1: Market Overview...")
    s1 = invoke_llm_with_retry(
        f"Write a detailed MARKET OVERVIEW for a 2026 intelligence report on: '{query_text}'.\n"
        f"These {len(comp_list)} companies are the key players: {comp_str}\n\n"
        f"Cover: market size, CAGR, key drivers, geographic hotspots, regulatory environment, 2026 outlook.\n"
        f"Reference all {len(comp_list)} companies naturally in the text.\n"
        f"Write 3-4 detailed paragraphs. Use markdown ## heading."
    )
    if s1: sections.append(clean_markdown_formatting(s1))

    print("📝 Section 2: Company Profiles...")
    s2 = invoke_llm_with_retry(
        f"Write KEY PLAYERS & COMPANY PROFILES for: '{query_text}'.\n"
        f"Write a detailed profile for EACH of these {len(comp_list)} companies — do not skip any:\n{comp_str}\n\n"
        f"Cover per company: what they do, competitive advantage, target market, achievements, growth trajectory.\n"
        f"Use markdown ## heading and ### for each company name."
    )
    if s2: sections.append(clean_markdown_formatting(s2))

    print("📝 Section 3: Trends & Landscape...")
    s3 = invoke_llm_with_retry(
        f"Write MARKET TRENDS & COMPETITIVE LANDSCAPE for: '{query_text}'.\n"
        f"Companies: {comp_str}\n\n"
        f"Cover: top 5 trends, technology shifts, competitive dynamics, consolidation, barriers, disruptions.\n"
        f"Use markdown ## heading and bullet points."
    )
    if s3: sections.append(clean_markdown_formatting(s3))

    print("📝 Section 4: Risk & Recommendation...")
    s4 = invoke_llm_with_retry(
        f"Write RISK ANALYSIS & INVESTMENT RECOMMENDATION for: '{query_text}'.\n"
        f"Rank ALL {len(comp_list)} of these companies by investment potential:\n{comp_str}\n\n"
        f"Cover: key risks (regulatory/tech/market), mitigation strategies, "
        f"investment opportunities ranked from best to worst with scores, "
        f"specific actionable recommendations, 2026-2028 outlook.\n"
        f"Use markdown ## heading. Be specific and actionable."
    )
    if s4: sections.append(clean_markdown_formatting(s4))

    if not sections:
        return {"final_report": "❌ Deep report generation failed."}

    # Chart data
    print(f"📊 Generating chart data for {len(company_names)} companies...")
    chart_data = _generate_chart_data(company_names, query_text)

    full_report = (
        f"# 2026 In-Depth Market Intelligence Report\n"
        f"## {query_text.title()}\n\n---\n\n"
        + "\n\n---\n\n".join(sections)
    )

    if chart_data:
        chart_json = json.dumps(chart_data, ensure_ascii=False)
        full_report += f"\n\n<!--CHART_DATA:{chart_json}:CHART_DATA-->"
        print(f"✅ Chart data embedded ({len(chart_json)} chars)")
    else:
        print("⚠️ No chart data — graphs will not display")

    print(f"✅ Deep report done — {len(full_report)} chars, {len(sections)} sections, {len(comp_list)} companies")
    return {"final_report": full_report}