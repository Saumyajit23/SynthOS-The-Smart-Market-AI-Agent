import time
import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS

async def crunchbase_tool(company_name: str) -> dict:
    """
    Fetches funding, stage, and investor data for a company.
    Strategy: Try Crunchbase direct scrape first, fall back to DDG funding search.

    Args:
        company_name: Name of the startup/company to research

    Returns:
        dict with funding data, investors, stage, and source
    """

    # ── ATTEMPT 1: Scrape Crunchbase directly ──
    try:
        crunchbase_url = None

        with DDGS() as ddgs:
            for r in ddgs.text(
                f"site:crunchbase.com/organization {company_name}",
                max_results=3
            ):
                url = r.get("href", "")
                if "crunchbase.com/organization" in url:
                    crunchbase_url = url
                    break

        if crunchbase_url:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(crunchbase_url, headers=headers)
                response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()

            text = " ".join(soup.get_text(separator=" ", strip=True).split())[:3000]

            if len(text) > 200:  # got real content
                return {
                    "status": "success",
                    "source": "crunchbase_direct",
                    "company": company_name,
                    "crunchbase_url": crunchbase_url,
                    "raw_data": text
                }

    except Exception:
        pass  # silently fall through to DDG fallback

    # ── ATTEMPT 2: DDG funding search fallback ──
    try:
        time.sleep(1)  # avoid rate limiting between calls

        articles = []
        queries = [
            f"{company_name} funding round investors 2025 2026",
            f"{company_name} valuation series venture capital",
        ]

        with DDGS() as ddgs:
            for q in queries:
                for r in ddgs.text(q, max_results=3):
                    articles.append({
                        "title": r.get("title", ""),
                        "snippet": r.get("body", ""),
                        "url": r.get("href", "")
                    })
                if articles:
                    break  # stop after first successful query

        if articles:
            return {
                "status": "success",
                "source": "ddg_funding_search",
                "company": company_name,
                "crunchbase_url": None,
                "raw_data": " | ".join(
                    f"{a['title']}: {a['snippet']}" for a in articles
                )[:3000]
            }

    except Exception as e:
        return {
            "status": "error",
            "source": "both_failed",
            "company": company_name,
            "error": str(e),
            "raw_data": ""
        }

    return {
        "status": "empty",
        "source": "both_failed",
        "company": company_name,
        "raw_data": ""
    }