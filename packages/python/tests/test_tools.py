"""The framework-neutral tools (oryne.tools) and the framework integrations. No network."""

from __future__ import annotations

import json

import httpx
import pytest
from stellar_sdk import Keypair

from oryne import OryneAgent
from oryne.tools import anthropic_tools, openai_tools, oryne_tools, run_tool

API = "https://api.oryne.test"
TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
MERCHANT = Keypair.random().public_key


def network(calls: list | None = None) -> httpx.Client:
    """The Oryne API, a free page, and a merchant asking 0.50 USDC for everything else."""

    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(str(request.url))
        if request.url.host == "api.oryne.test" and request.url.path == "/v1/agent":
            return httpx.Response(
                200,
                json={
                    "agent": {"publicKey": "G", "wallet": "C", "name": "t", "status": "active", "perTx": "1", "budget": "10", "remaining": "9.5"},
                    "network": "stellar-testnet",
                    "rpcUrl": "https://rpc.invalid",
                    "networkPassphrase": "Test SDF Network ; September 2015",
                    "token": TOKEN,
                    "simulationSource": MERCHANT,
                    "walletBalance": "10",
                },
            )
        if request.url.host == "api.oryne.test" and request.url.path == "/v1/services":
            return httpx.Response(200, json={"services": [{"q": request.url.params.get("q")}]})
        if request.url.path == "/free":
            return httpx.Response(200, text="hello")
        requirements = {
            "scheme": "exact",
            "network": "stellar-testnet",
            "asset": TOKEN,
            "maxAmountRequired": "5000000",
            "payTo": MERCHANT,
            "resource": str(request.url),
            "facilitator": f"{API}/v1/x402",
            "maxTimeoutSeconds": 60,
        }
        return httpx.Response(402, json={"x402Version": 1, "accepts": [requirements]})

    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)


def tools_for(calls: list | None = None, **options):
    seen: list[str] = []
    agent = OryneAgent(Keypair.random().secret, api_url=API, http=network(calls), on_payment=lambda event: seen.append(event.type))
    return oryne_tools(agent, **options), seen


def test_four_tools_with_object_schemas():
    tools, _ = tools_for()
    assert [tool.name for tool in tools] == ["fetch_paid", "wallet_status", "request_approval", "find_service"]
    assert all(tool.parameters["type"] == "object" for tool in tools)
    assert [tool.name for tool in tools_for(only=["find_service"])[0]] == ["find_service"]


def test_fetch_paid_returns_a_free_page():
    tools, _ = tools_for()
    assert run_tool(tools, "fetch_paid", {"url": "https://shop.test/free"}) == "HTTP 200\n\nhello"


def test_fetch_paid_explains_a_refusal_and_the_agent_hears_of_it():
    tools, seen = tools_for()
    result = run_tool(tools, "fetch_paid", json.dumps({"url": "https://shop.test/report", "maxPrice": "0.10"}))
    assert result.startswith("Not paid: Asks 0.5, above the 0.10 expected")
    assert f"asked for 0.5 USDC to {MERCHANT}" in result
    assert seen == ["refused"]


def test_fetch_paid_checks_input_before_fetching():
    calls: list = []
    tools, _ = tools_for(calls)
    assert "full address" in run_tool(tools, "fetch_paid", {"url": "shop.test"})
    assert "maxPrice must be" in run_tool(tools, "fetch_paid", {"url": "https://shop.test/a", "maxPrice": "lots"})
    assert calls == []


def test_wallet_status_and_find_service():
    tools, _ = tools_for()
    assert json.loads(run_tool(tools, "wallet_status", ""))["agent"]["remaining"] == "9.5"
    assert json.loads(run_tool(tools, "find_service", {"query": "web search"}))["services"][0]["q"] == "web search"


def test_request_approval_refuses_incomplete_input_without_calling_the_api():
    calls: list = []
    tools, _ = tools_for(calls)
    assert run_tool(tools, "request_approval", {"payTo": MERCHANT, "amount": "ten"}).startswith("Not asked")
    assert calls == []


def test_run_tool_handles_unknown_tools_and_bad_arguments():
    tools, _ = tools_for()
    assert run_tool(tools, "drain_wallet", {}) == "Unknown tool: drain_wallet"
    assert "valid JSON" in run_tool(tools, "fetch_paid", "{not json")
    assert "must be an object" in run_tool(tools, "fetch_paid", "[]")


def test_openai_and_anthropic_formats():
    tools, _ = tools_for()
    openai = openai_tools(tools)
    assert openai[0]["type"] == "function" and openai[0]["function"]["parameters"] == tools[0].parameters
    assert anthropic_tools(tools)[3] == {"name": "find_service", "description": tools[3].description, "input_schema": tools[3].parameters}


def test_langchain_tools():
    pytest.importorskip("langchain_core")
    from oryne.integrations.langchain import oryne_langchain_tools

    agent = OryneAgent(Keypair.random().secret, api_url=API, http=network())
    tools = oryne_langchain_tools(agent)
    assert tools[0].name == "fetch_paid"
    assert tools[0].invoke({"url": "https://shop.test/free"}) == "HTTP 200\n\nhello"


def test_crewai_tools():
    pytest.importorskip("crewai")
    from oryne.integrations.crewai import oryne_crewai_tools

    agent = OryneAgent(Keypair.random().secret, api_url=API, http=network())
    tools = oryne_crewai_tools(agent)
    assert tools[0].name == "fetch_paid"
    assert tools[0].run(url="https://shop.test/free") == "HTTP 200\n\nhello"


def test_openai_agents_tools():
    pytest.importorskip("agents")
    import asyncio

    from oryne.integrations.openai_agents import oryne_openai_agents_tools

    agent = OryneAgent(Keypair.random().secret, api_url=API, http=network())
    tools = oryne_openai_agents_tools(agent)
    assert tools[0].name == "fetch_paid" and tools[0].strict_json_schema is False
    result = asyncio.run(tools[0].on_invoke_tool(None, json.dumps({"url": "https://shop.test/free"})))
    assert result == "HTTP 200\n\nhello"
