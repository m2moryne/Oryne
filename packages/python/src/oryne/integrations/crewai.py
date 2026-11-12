"""Oryne tools for CrewAI.

    from crewai import Agent
    from oryne import OryneAgent
    from oryne.integrations.crewai import oryne_crewai_tools

    researcher = Agent(role="Researcher", goal="...", backstory="...",
                       tools=oryne_crewai_tools(OryneAgent(os.environ["ORYNE_AGENT_SECRET"])))
"""

from __future__ import annotations

from typing import Any, Optional

from ..agent import OryneAgent
from ..tools import OryneTool, oryne_tools


def _args_model(tool: OryneTool) -> Any:
    """A pydantic model for the tool's input, which is what CrewAI validates against."""
    from pydantic import Field, create_model

    required = set(tool.parameters.get("required", []))
    fields: dict[str, Any] = {}
    for name, spec in tool.parameters.get("properties", {}).items():
        description = spec.get("description", "")
        if name in required:
            fields[name] = (str, Field(..., description=description))
        else:
            fields[name] = (Optional[str], Field(None, description=description))
    return create_model(f"{tool.name.title().replace('_', '')}Input", **fields)


def oryne_crewai_tools(agent: OryneAgent, **options: Any) -> list[Any]:
    """CrewAI ``BaseTool`` tools for ``agent``. ``options`` go to :func:`oryne.tools.oryne_tools`."""
    try:
        from crewai.tools import BaseTool
    except ImportError as error:  # pragma: no cover - depends on what's installed
        raise ImportError('CrewAI is not installed: pip install "oryne[crewai]"') from error

    def convert(oryne: OryneTool) -> Any:
        schema = _args_model(oryne)

        class OryneCrewAITool(BaseTool):
            name: str = oryne.name
            description: str = oryne.description
            args_schema: Any = schema

            def _run(self, **kwargs: Any) -> str:
                return oryne.run(**{key: value for key, value in kwargs.items() if value is not None})

        return OryneCrewAITool()

    return [convert(tool) for tool in oryne_tools(agent, **options)]
