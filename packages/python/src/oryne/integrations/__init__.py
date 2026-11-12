"""Oryne's tools as each agent framework expects them.

Each module imports its framework only when used, so install the one you need:

- :mod:`oryne.integrations.langchain`: ``pip install "oryne[langchain]"`` (LangChain, LangGraph)
- :mod:`oryne.integrations.crewai`: ``pip install "oryne[crewai]"``
- :mod:`oryne.integrations.openai_agents`: ``pip install "oryne[openai-agents]"``

For plain OpenAI-style or Claude tool calling, see :mod:`oryne.tools`.
"""
