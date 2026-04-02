"""
LiveKit Worker Entry Point for Cloud Run Jobs.

WHY THIS ARCHITECTURE:
======================
Cloud Run Services are request-driven and will SIGTERM containers
with no active HTTP traffic. LiveKit agents maintain WebSocket
connections to LiveKit Cloud, not HTTP requests, so Services will
always kill the container after idle timeout.

Cloud Run Jobs are task-driven and run until the task completes.
This is the correct primitive for a long-running voice agent.

WHY NO CLI HELPERS:
===================
cli.run_app() is designed for standalone development:
- Manages its own signal handlers (conflicts with Job lifecycle)
- Creates internal event loops (unpredictable in containers)
- Expects to own the process (breaks in multi-component setups)

We use agents.AgentServer directly with asyncio.run() for:
- Single, clean event loop
- Predictable shutdown behavior
- Full control over lifecycle

USAGE:
======
Cloud Run Job: CMD ["python", "worker_main.py"]
Local dev:     python worker_main.py

API CHANGES (livekit-agents >= 1.3.x):
======================================
- agents.Worker → agents.AgentServer
- Uses @server.rtc_session(agent_name=...) decorator pattern
- agent_name is set in the rtc_session decorator, NOT the constructor
- setup_fnc property replaces prewarm_fnc constructor param
"""

from __future__ import annotations

import os
import sys
import signal
import asyncio
import logging
from dotenv import load_dotenv

# Configure root logging once for third-party libraries. The application logger
# is configured separately in config.py and should not be force-reset here.
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

load_dotenv(".env")
load_dotenv(".env.local")

WORKER_PORT = str(int(os.getenv("WORKER_PORT", "8080")))
os.environ["PORT"] = WORKER_PORT

from livekit import agents
from livekit.agents import AgentServer, JobContext, JobProcess
from livekit.plugins import silero

# Pre-register Azure plugin on the main thread BEFORE any child processes spawn.
# LiveKit requires plugins to be registered on the main thread; doing it here
# (at module level) satisfies that requirement.
try:
    from livekit.plugins import azure as _azure_plugin  # noqa: F401
    logging.getLogger("snappy_agent").info("[INIT] ✓ Azure plugin registered on main thread")
except ImportError:
    logging.getLogger("snappy_agent").warning(
        "[INIT] ⚠ livekit-plugins-azure not installed (Urdu TTS unavailable)"
    )

# Local imports
from config import (
    logger,
    LIVEKIT_AGENT_NAME,
    ENVIRONMENT,
)
from agent_wrapper import entrypoint, get_livekit_agent_name, load_agent_runtime_env
from services.clinic_knowledge_service import process_pending_clinic_knowledge_sync_jobs

load_agent_runtime_env()

# =============================================================================
# SIGNAL HANDLING — Graceful shutdown for Cloud Run
# =============================================================================

_shutdown_event = asyncio.Event()
_clinic_knowledge_sync_poll_seconds = max(
    0,
    int(os.getenv("CLINIC_KNOWLEDGE_SYNC_POLL_SECONDS", "45")),
)


def _handle_sigterm(signum, frame):
    """
    Handle SIGTERM from Cloud Run.
    
    Cloud Run sends SIGTERM when:
    - Job timeout is reached
    - Job is cancelled
    - Container is being replaced
    
    We set an event to allow graceful shutdown rather than hard exit.
    """
    sig_name = signal.Signals(signum).name
    logger.info(f"[WORKER] Received {sig_name}, initiating graceful shutdown...")
    _shutdown_event.set()


# =============================================================================
# PREWARM — Called once when worker starts
# =============================================================================

def prewarm(proc: JobProcess):
    """
    Prewarm function called once when the worker process starts.
    
    Use this to:
    - Load models (VAD, etc.)
    - Verify external service connections
    - Log startup diagnostics
    
    NOTE: Plugin registration (e.g. Azure) is done at module level,
    not here, because prewarm runs in child processes and LiveKit
    requires plugins to be registered on the main thread.
    """
    logger.info(f"[PREWARM] Worker identity: {LIVEKIT_AGENT_NAME}")
    
    # Load VAD model
    try:
        silero.VAD.load()
        logger.info("[PREWARM] ✓ Silero VAD loaded")
    except Exception as e:
        logger.error(f"[PREWARM] ✗ VAD load failed: {e}")
    


# =============================================================================
# CREATE AGENT SERVER
# =============================================================================

# Create the AgentServer instance (replaces the old Worker class)
# NOTE: agent_name is NOT a constructor parameter in 1.3.x
# It's set via @server.rtc_session(agent_name=...) decorator
server = AgentServer(
    load_threshold=1.0,
    setup_fnc=prewarm,
    port=int(WORKER_PORT),
    host="0.0.0.0",
)


# =============================================================================
# RTC SESSION — Register entrypoint using decorator pattern
# =============================================================================

@server.rtc_session(agent_name=get_livekit_agent_name())
async def session_entrypoint(ctx: JobContext):
    """
    RTC session entrypoint - delegates to the actual agent entrypoint.
    
    This decorator pattern is required for livekit-agents >= 1.3.x.
    The @server.rtc_session() decorator registers this function as the
    handler for incoming LiveKit room connections.
    
    The agent_name parameter here is what enables explicit dispatch.
    """
    logger.info("[RTC] session_entrypoint invoked")
    await entrypoint(ctx)


# =============================================================================
# MAIN — Clean asyncio entry point
# =============================================================================

async def main():
    """
    Main async entry point for the LiveKit worker.
    
    WHY asyncio.run() IS CORRECT:
    - Creates a single event loop for the process
    - Runs until the coroutine completes or is cancelled
    - Cleans up properly on exit
    
    WHY NOT cli.run_app():
    - Designed for development, not containerized production
    - Manages its own signals (conflicts with Cloud Run)
    - Not needed when we have full control over the process
    """
    logger.info("[WORKER] Starting LiveKit worker...")
    logger.info(f"[WORKER] Agent name: {get_livekit_agent_name()}")
    logger.info(f"[WORKER] Environment: {ENVIRONMENT}")

    sync_task: asyncio.Task | None = None

    async def _clinic_knowledge_sync_loop() -> None:
        while not _shutdown_event.is_set():
            try:
                processed = await process_pending_clinic_knowledge_sync_jobs(limit=5)
                if processed:
                    logger.info("[CLINIC KNOWLEDGE SYNC LOOP] processed=%s", processed)
            except Exception:
                logger.exception("[CLINIC KNOWLEDGE SYNC LOOP] iteration failed")
            try:
                await asyncio.wait_for(_shutdown_event.wait(), timeout=_clinic_knowledge_sync_poll_seconds)
            except asyncio.TimeoutError:
                continue

    if _clinic_knowledge_sync_poll_seconds > 0:
        sync_task = asyncio.create_task(_clinic_knowledge_sync_loop())
    
    # Run the server
    # This blocks until the server is shut down (SIGTERM or error)
    try:
        await server.run()
    except asyncio.CancelledError:
        logger.info("[WORKER] Worker cancelled, shutting down...")
    except Exception:
        logger.exception("[WORKER] Worker crashed with exception")
        raise
    finally:
        if sync_task is not None:
            sync_task.cancel()
            try:
                await sync_task
            except asyncio.CancelledError:
                pass
        logger.info("[WORKER] Worker stopped")


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    # Register signal handlers before starting async code
    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)
    
    logger.info("=" * 60)
    logger.info(" LIVEKIT WORKER — CLOUD RUN JOB MODE")
    logger.info("=" * 60)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("[WORKER] Interrupted by user")
    except SystemExit as e:
        logger.info(f"[WORKER] System exit: {e.code}")
    except Exception:
        logger.exception("[WORKER] Fatal error")
        sys.exit(1)
    
    logger.info("[WORKER] Process exiting cleanly")
