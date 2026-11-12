"""A research agent built with LangChain. Oryne's tools come from oryne_langchain_tools().

    python langchain_agent.py "your question"
"""

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from oryne.integrations.langchain import oryne_langchain_tools
from shared import INSTRUCTIONS, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, QUESTION, log_tool_call, oryne

agent = create_agent(
    ChatOpenAI(model=LLM_MODEL, api_key=LLM_API_KEY, base_url=LLM_BASE_URL),
    tools=oryne_langchain_tools(oryne),
    system_prompt=INSTRUCTIONS,
)

answer = ""
for step in agent.stream({"messages": [("user", QUESTION)]}, {"recursion_limit": 30}, stream_mode="updates"):
    for update in step.values():
        for message in (update or {}).get("messages", []):
            for call in getattr(message, "tool_calls", None) or []:
                log_tool_call(call["name"], call["args"])
            if message.type == "ai" and not getattr(message, "tool_calls", None):
                answer = message.content

print(f"\n{answer}\n")
