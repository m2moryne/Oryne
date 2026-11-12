"""What every example shares: the agent's Oryne wallet, the model settings and the task."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

from oryne import OryneAgent, PaymentEvent

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _required(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        sys.exit(f"Set {name} in examples/frameworks/.env (see .env.example).")
    return value


def say(icon: str, text: str) -> None:
    print(f"{icon}  {text}", flush=True)


def _on_payment(event: PaymentEvent) -> None:
    path = urlparse(event.requirements.get("resource", "")).path
    if event.type == "paying":
        say("💳", f"paying {event.amount} USDC for {path}")
    elif event.type == "paid":
        say("✅", f"paid · tx {(event.settlement or {}).get('transaction', '?')[:12]}…")
    else:
        where = "before signing" if event.source == "client" else "by the wallet"
        say("⛔", f"not paid ({where}): {event.reason}")


#: The agent's wallet. Payments are printed as they happen.
oryne = OryneAgent(_required("ORYNE_AGENT_SECRET"), api_url=os.environ.get("ORYNE_API_URL"), on_payment=_on_payment)

#: Any OpenAI-compatible chat API; DeepSeek by default.
LLM_API_KEY = (os.environ.get("LLM_API_KEY") or "").strip() or _required("DEEPSEEK_API_KEY")
LLM_BASE_URL = (os.environ.get("LLM_BASE_URL") or "").strip() or "https://api.deepseek.com"
LLM_MODEL = (os.environ.get("LLM_MODEL") or "").strip() or "deepseek-chat"

MERCHANT = ((os.environ.get("MERCHANT_URL") or "").strip() or "https://demo.oryne.org").rstrip("/")

INSTRUCTIONS = f"""You are a research assistant with your own Oryne wallet (USDC on Stellar).
Paid sources are at {MERCHANT}: GET / lists them with prices (it's free). Use fetch_paid to buy what helps,
with a maxPrice a little above the listed price. Check wallet_status first to see your limits.
If a payment is refused by the wallet, decide whether it's worth it; if it is, use request_approval with the
payTo address and amount from the refusal, then try again once approved. Never pay for the same thing twice.
Finish with a short answer and list what you bought and what it cost."""

QUESTION = " ".join(sys.argv[1:]) or "What are agent payments on Stellar, and why do limits matter?"


def log_tool_call(name: str, arguments: object) -> None:
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments or "{}")
        except ValueError:
            pass
    shown = json.dumps(arguments) if arguments else ""
    say("🔧", f"{name}({'' if shown == '{}' else shown})")


say("🧭", f"question: {QUESTION}")
