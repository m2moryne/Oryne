"""Oryne tools for the OpenAI Agents SDK.

    from agents import Agent, Runner
    from oryne import OryneAgent
    from oryne.integrations.openai_agents import oryne_openai_agents_tools

    agent = Agent(name="Researcher", instructions="...",
                  tools=oryne_openai_agents_tools(OryneAgent(os.environ["ORYNE_AGENT_SECRET"])))
    result = Runner.run_sync(agent, "Find the latest Stellar news")
"""

from __future__ import annotations

import asyncio
from typing import Any

from ..agent import OryneAgent
from ..tools import OryneTool, oryne_tools, run_tool


def oryne_openai_agents_tools(agent: OryneAgent, **options: Any) -> list[Any]:
    """OpenAI Agents SDK ``FunctionTool`` tools for ``agent``. ``options`` go to :func:`oryne.tools.oryne_tools`."""
    try:
        from agents import FunctionTool
    except ImportError as error:  # pragma: no cover - depends on what's installed
        raise ImportError('The OpenAI Agents SDK is not installed: pip install "oryne[openai-agents]"') from error

    def convert(tool: OryneTool) -> Any:
        async def invoke(_context: Any, arguments: str) -> str:
            # The SDK is async; Oryne's client is sync, so it runs in a worker thread.
            return await asyncio.to_thread(run_tool, [tool], tool.name, arguments)

        return FunctionTool(
            name=tool.name,
            description=tool.description,
            params_json_schema=tool.parameters,
            on_invoke_tool=invoke,
            # Optional fields (method, maxPrice...) aren't allowed in strict mode.
            strict_json_schema=False,
        )

    return [convert(tool) for tool in oryne_tools(agent, **options)]
