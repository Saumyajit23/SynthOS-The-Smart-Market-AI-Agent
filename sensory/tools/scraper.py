import httpx
from bs4 import BeautifulSoup
from typing import Optional

async def scraper_tool(url: str, max_chars: Optional[int] = 3000) -> dict:
    """
    Scrape a webpage and return clean text content.

    Args:
        url: The URL to scrape
        max_chars: Max characters to return (default 3000)

    Returns:
        dict with scraped text and metadata
    """
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Remove noise
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        text = soup.get_text(separator=" ", strip=True)
        clean_text = " ".join(text.split())[:max_chars]

        return {
            "status": "success",
            "url": url,
            "content": clean_text,
            "char_count": len(clean_text)
        }

    except httpx.TimeoutException:
        return {"status": "timeout", "url": url, "content": "", "error": "Request timed out"}
    except Exception as e:
        return {"status": "error", "url": url, "content": "", "error": str(e)}