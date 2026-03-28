"""Poll an agent health endpoint until it becomes live."""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

import aiohttp


async def verify_agent(health_url: str, *, phone_number: str | None, timeout_seconds: int) -> dict[str, Any]:
    """Poll the agent `/health` endpoint until it returns HTTP 200.

    Params:
        health_url: Full HTTP(S) URL to the agent health endpoint.
        phone_number: Optional phone number to echo on success.
        timeout_seconds: Maximum seconds to wait.
    Returns:
        Parsed health JSON payload.
    Raises:
        TimeoutError: If the endpoint never becomes healthy.
    """
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    async with aiohttp.ClientSession() as session:
        while asyncio.get_running_loop().time() < deadline:
            try:
                async with session.get(health_url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        payload = await response.json()
                        payload["phone_number"] = phone_number
                        return payload
            except aiohttp.ClientError:
                pass
            await asyncio.sleep(5)
    raise TimeoutError(f"Timed out waiting for {health_url}")


def _build_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser.

    Returns:
        Configured argument parser.
    """
    parser = argparse.ArgumentParser(description="Poll an agent health endpoint until it is live.")
    parser.add_argument("--health-url", required=True, help="Agent health endpoint URL.")
    parser.add_argument("--phone-number", help="Phone number to print on success.")
    parser.add_argument("--timeout", type=int, default=90, help="Timeout in seconds.")
    return parser


async def _main() -> None:
    """Parse CLI args and print the verification result.

    Returns:
        None.
    """
    args = _build_parser().parse_args()
    payload = await verify_agent(
        args.health_url,
        phone_number=args.phone_number,
        timeout_seconds=args.timeout,
    )
    phone_suffix = f" Phone: {payload['phone_number']}" if payload.get("phone_number") else ""
    print(f"Agent is live. Agent ID: {payload.get('agent_id')} Port: {payload.get('port')}.{phone_suffix}")


if __name__ == "__main__":
    asyncio.run(_main())
