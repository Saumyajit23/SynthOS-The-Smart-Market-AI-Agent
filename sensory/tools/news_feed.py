from ddgs import DDGS
from typing import Optional

async def news_feed_tool(query: str, max_results: Optional[int] = 6) -> dict:
    """
    Fetch latest startup and market news for a given topic.

    Args:
        query: Topic to search news for
        max_results: Number of news items (default 6)

    Returns:
        dict with news articles and metadata
    """
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

        if not articles:
            return {"status": "empty", "articles": [], "query": query}

        return {
            "status": "success",
            "query": query,
            "count": len(articles),
            "articles": articles
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "query": query,
            "articles": []
        }