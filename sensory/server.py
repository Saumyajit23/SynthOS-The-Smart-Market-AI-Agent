from fastmcp import FastMCP
from tools.web_search import web_search_tool
from tools.scraper import scraper_tool
from tools.news_feed import news_feed_tool
from tools.crunchbase import crunchbase_tool

mcp = FastMCP(name="SynthOS Sensory Layer")

mcp.tool()(web_search_tool)
mcp.tool()(scraper_tool)
mcp.tool()(news_feed_tool)
mcp.tool()(crunchbase_tool)

if __name__ == "__main__":
    print("🧠 SynthOS MCP Sensory Server starting on port 8001...")
    mcp.run(transport="http", host="0.0.0.0", port=8001)