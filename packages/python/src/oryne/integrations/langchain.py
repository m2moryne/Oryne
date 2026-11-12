"""Oryne tools for LangChain and LangGraph.

    from oryne import OryneAgent
    from oryne.integrations.langchain import oryne_langchain_tools

    tools = oryne_langchain_tools(OryneAgent(os.environ["ORYNE_AGENT_SECRET"]))
    llm_with_tools = llm.bind_tools(tools)          # or create_react_agent(llm, tools)
"""

from __future__ import annotations

from typing import Any

from ..agent import OryneAgent
from ..tools import OryneTool, oryne_tools


def oryne_langchain_tools(agent: OryneAgent, **options: Any) -> list[Any]:
    """LangChain ``StructuredTool`` tools for ``agent``. ``options`` go to :func:`oryne.tools.oryne_tools`."""
    try:
        from langchain_core.tools import StructuredTool
    except ImportError as error:  # pragma: no cover - depends on what's installed
        raise ImportError('LangChain is not installed: pip install "oryne[langchain]"') from error

    def convert(tool: OryneTool) -> Any:
        return StructuredTool.from_function(
            func=tool.run,
            name=tool.name,
            description=tool.description,
            args_schema=tool.parameters,
        )

    return [convert(tool) for tool in oryne_tools(agent, **options)]
