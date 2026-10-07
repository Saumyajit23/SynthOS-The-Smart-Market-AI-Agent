from langgraph.graph import StateGraph, START, END
from .state import AgentState
from .nodes import (
    research_node, analysis_node, synthesis_node,
    deep_research_node, deep_analysis_node, deep_synthesis_node
)

# ============================================================
# BRIEF REPORT GRAPH
# ============================================================
brief_workflow = StateGraph(AgentState)
brief_workflow.add_node("researcher", research_node)
brief_workflow.add_node("analyst", analysis_node)
brief_workflow.add_node("strategist", synthesis_node)
brief_workflow.add_edge(START, "researcher")
brief_workflow.add_edge("researcher", "analyst")
brief_workflow.add_edge("analyst", "strategist")
brief_workflow.add_edge("strategist", END)
app = brief_workflow.compile()

# ============================================================
# DEEP ANALYSIS GRAPH
# ============================================================
deep_workflow = StateGraph(AgentState)
deep_workflow.add_node("deep_researcher", deep_research_node)
deep_workflow.add_node("deep_analyst", deep_analysis_node)
deep_workflow.add_node("deep_strategist", deep_synthesis_node)
deep_workflow.add_edge(START, "deep_researcher")
deep_workflow.add_edge("deep_researcher", "deep_analyst")
deep_workflow.add_edge("deep_analyst", "deep_strategist")
deep_workflow.add_edge("deep_strategist", END)
deep_app = deep_workflow.compile()


# Terminal test
if __name__ == "__main__":
    test_query = "fintech startups USA"

    print("\n" + "="*60)
    print(f"🚀 BRIEF TEST: {test_query}")
    print("="*60)
    brief_result = app.invoke({
        "messages": [{"role": "user", "content": test_query}],
        "research_data": "", "new_entities": [],
        "competitor_list": [], "market_trends": "", "final_report": ""
    })
    print(brief_result.get("final_report", "No report")[:500])

    print("\n" + "="*60)
    print(f"🔬 DEEP TEST: {test_query}")
    print("="*60)
    deep_result = deep_app.invoke({
        "messages": [{"role": "user", "content": test_query}],
        "research_data": "", "new_entities": [],
        "competitor_list": [], "market_trends": "", "final_report": ""
    })
    print(deep_result.get("final_report", "No report")[:500])