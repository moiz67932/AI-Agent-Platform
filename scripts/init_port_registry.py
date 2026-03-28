"""Seed the port registry table with ports 8001-8500."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
root_str = str(ROOT)
if root_str not in sys.path:
    sys.path.insert(0, root_str)

from database.db import close_db_pool, db_transaction, init_db_pool


async def main() -> None:
    """Insert the full supported port range into `port_registry`.

    Returns:
        None.
    Raises:
        RuntimeError: Propagated if `DATABASE_URL` is missing.
    """
    await init_db_pool()
    try:
        async with db_transaction() as connection:
            await connection.execute(
                """
                INSERT INTO port_registry (port)
                SELECT port_number
                FROM generate_series(8001, 8500) AS port_number
                ON CONFLICT (port) DO NOTHING
                """
            )
    finally:
        await close_db_pool()


if __name__ == "__main__":
    asyncio.run(main())
