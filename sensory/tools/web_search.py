from ddgs import DDGS
from typing import Optional

async def web_search_tool(query: str, max_results: Optional[int] = 8) -> dict:
    """
    Search the web for startup and market intelligence data.
    
    Args:
        query: The search query string
        max_results: Number of results to return (default 8)
    
    Returns:
        dict with results list and status
    """
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

        return {
            "status": "success",
            "query": query,
            "count": len(results),
            "results": results
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "query": query,
            "results": []
        }