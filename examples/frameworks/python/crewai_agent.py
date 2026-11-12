"""A research agent built with CrewAI. Oryne's tools come from oryne_crewai_tools().
CrewAI supports Python 3.10 to 3.13.

    pip install "oryne[crewai]>=0.3.0" python-dotenv
    python crewai_agent.py "your question"
"""

import os

# No telemetry or trace-sharing prompts from CrewAI.
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")

from crewai import LLM, Agent, Crew, Task  # noqa: E402

from oryne.integrations.crewai import oryne_crewai_tools  # noqa: E402
from shared import INSTRUCTIONS, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, QUESTION, oryne  # noqa: E402

researcher = Agent(
    role="Researcher",
    goal="Answer the question well, paying only for sources that help",
    backstory=INSTRUCTIONS,
    # "openai/<model>" tells CrewAI the API speaks OpenAI's format, whoever runs it.
    llm=LLM(model=f"openai/{LLM_MODEL}", api_key=LLM_API_KEY, base_url=LLM_BASE_URL),
    tools=oryne_crewai_tools(oryne),
    verbose=False,
)
task = Task(
    description=QUESTION,
    expected_output="A short answer, then what you bought and what it cost.",
    agent=researcher,
)
print(f"\n{Crew(agents=[researcher], tasks=[task], tracing=False).kickoff()}\n")
