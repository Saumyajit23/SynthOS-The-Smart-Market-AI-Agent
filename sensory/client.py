import time
import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS

class SynthOSSensoryClient:
    """
    MCP-architected sensory layer.
    Tools are defined in sensory/tools/ and called directly —
    matching MCP tool interface exactly (same functions, same signatures).
    Architecture is MCP-compliant; transport is optimized for uvicorn on Windows.
    """

    def search_sync(self, query: str, max_results: int = 8) -> dict:
        """MCP tool: web_search_tool"""
        try:
            results = []
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=max_results):
                    results.append({
                        "title": r.get("title", ""),
                        "snippet": r.get("body", ""),
                        "url": r.get("href", "")
                    })
            if not results:
                return {"status": "empty", "results": [], "query": query}
            return {"status": "success", "query": query, "count": len(results), "results": results}
        except Exception as e:
            return {"status": "error", "error": str(e), "query": query, "results": []}

    def news_sync(self, query: str, max_results: int = 6) -> dict:
        """MCP tool: news_feed_tool"""
        for attempt in range(2):
            try:
                articles = []
                with DDGS() as ddgs:
                    for r in ddgs.news(query, max_results=max_results):
                        articles.append({
                            "title": r.get("title", ""),
                            "summary": r.get("body", ""),
                            "url": r.get("url", ""),
                            "source": r.get("source", ""),
                            "published": r.get("date", "")
                        })
                if articles:
                    return {"status": "success", "query": query, "count": len(articles), "articles": articles}
            except Exception:
                time.sleep(2)
        return {"status": "error", "query": query, "articles": []}

    def scrape_sync(self, url: str, max_chars: int = 3000) -> dict:
        """MCP tool: scraper_tool"""
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url, headers=headers)
                response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            text = " ".join(soup.get_text(separator=" ", strip=True).split())[:max_chars]
            return {"status": "success", "url": url, "content": text, "char_count": len(text)}
        except Exception as e:
            return {"status": "error", "url": url, "content": "", "error": str(e)}

    def crunchbase_sync(self, company_name: str) -> dict:
        """MCP tool: crunchbase_tool"""
        try:
            crunchbase_url = None
            with DDGS() as ddgs:
                for r in ddgs.text(f"site:crunchbase.com/organization {company_name}", max_results=3):
                    url = r.get("href", "")
                    if "crunchbase.com/organization" in url:
                        crunchbase_url = url
                        break
            if crunchbase_url:
                headers = {"User-Agent": "Mozilla/5.0 Chrome/120.0.0.0"}
                with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                    response = client.get(crunchbase_url, headers=headers)
                soup = BeautifulSoup(response.text, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    tag.decompose()
                text = " ".join(soup.get_text(separator=" ", strip=True).split())[:3000]
                if len(text) > 200:
                    return {"status": "success", "source": "crunchbase_direct", "company": company_name, "crunchbase_url": crunchbase_url, "raw_data": text}
        except Exception:
            pass

        try:
            time.sleep(1)
            articles = []
            with DDGS() as ddgs:
                for r in ddgs.text(f"{company_name} funding round investors valuation 2025 2026", max_results=3):
                    articles.append({"title": r.get("title", ""), "snippet": r.get("body", ""), "url": r.get("href", "")})
            if articles:
                return {"status": "success", "source": "ddg_funding_search", "company": company_name, "crunchbase_url": None, "raw_data": " | ".join(f"{a['title']}: {a['snippet']}" for a in articles)[:3000]}
        except Exception as e:
            return {"status": "error", "source": "both_failed", "company": company_name, "error": str(e), "raw_data": ""}

        return {"status": "empty", "company": company_name, "raw_data": ""}


# Singleton
sensory = SynthOSSensoryClient()