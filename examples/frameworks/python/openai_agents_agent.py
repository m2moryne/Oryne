"""A research agent built with the OpenAI Agents SDK. Oryne's tools come from oryne_openai_agents_tools().

    python openai_agents_agent.py "your question"
"""

from agents import Agent, RunHooks, Runner, set_default_openai_api, set_default_openai_client, set_tracing_disabled
from openai import AsyncOpenAI

from oryne.integrations.openai_agents import oryne_openai_agents_tools
from shared import INSTRUCTIONS, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, QUESTION, log_tool_call, oryne

# Any OpenAI-compatible API works through Chat Completions; tracing is an OpenAI-only service.
set_default_openai_client(AsyncOpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL))
set_default_openai_api("chat_completions")
set_tracing_disabled(True)


class LogTools(RunHooks):
    async def on_tool_start(self, context, agent, tool):  # noqa: ANN001
        log_tool_call(tool.name, getattr(context, "tool_arguments", None) or {})


researcher = Agent(name="Researcher", instructions=INSTRUCTIONS, model=LLM_MODEL, tools=oryne_openai_agents_tools(oryne))
result = Runner.run_sync(researcher, QUESTION, max_turns=12, hooks=LogTools())
print(f"\n{result.final_output}\n")
