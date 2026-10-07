from typing import TypedDict, Annotated, List
import operator
 
 
class AgentState(TypedDict):
    # 'operator.add' is INTENTIONAL here — messages should accumulate across turns
    messages: Annotated[list, operator.add]
 
    # ✅ FIX: These are plain lists now (no operator.add)
    # operator.add was causing results from Query 1 to bleed into Query 2, 3, etc.
    # LangGraph replaces these cleanly on every fresh invocation.
    new_entities: list
    competitor_list: list
 
    # Plain string fields — replaced on every run
    research_data: str
    market_trends: str
    final_report: str