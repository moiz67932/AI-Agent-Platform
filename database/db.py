"""Async database helpers for the multi-tenant voice agent platform."""

from __future__ import annotations

import os
import socket
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, AsyncIterator
from urllib.parse import urlparse
from dotenv import load_dotenv


load_dotenv(".env")
load_dotenv(".env.local")

if TYPE_CHECKING:
    import asyncpg


DatabaseRecord = dict[str, Any]

_POOL: Any | None = None


def _require_asyncpg() -> Any:
    """Import `asyncpg` lazily with a clearer installation error.

    Returns:
        Imported `asyncpg` module.
    Raises:
        RuntimeError: If `asyncpg` is not installed in the active environment.
    """
    try:
        import asyncpg as asyncpg_module
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "The 'asyncpg' package is not installed in the active environment. "
            "Install dependencies with: pip install -r requirements.txt"
        ) from exc
    return asyncpg_module


def _get_database_url(explicit_url: str | None = None) -> str:
    """Resolve the database URL from input or environment.

    Params:
        explicit_url: Explicit PostgreSQL connection string if provided.
    Returns:
        Resolved PostgreSQL connection string.
    Raises:
        RuntimeError: If no database URL is configured.
    """
    resolved_url = explicit_url or os.getenv("DATABASE_URL")
    if not resolved_url:
        raise RuntimeError("DATABASE_URL is required")
    return resolved_url


async def init_db_pool(
    database_url: str | None = None,
    *,
    min_size: int = 1,
    max_size: int = 10,
) -> asyncpg.Pool:
    """Create and cache the global asyncpg pool.

    Params:
        database_url: Explicit PostgreSQL connection string. Falls back to `DATABASE_URL`.
        min_size: Minimum number of pooled connections.
        max_size: Maximum number of pooled connections.
    Returns:
        The initialized asyncpg pool.
    Raises:
        RuntimeError: If no database URL is configured.
    """
    global _POOL
    if _POOL is not None:
        return _POOL

    asyncpg = _require_asyncpg()
    resolved_url = _get_database_url(database_url)

    try:
        _POOL = await asyncpg.create_pool(
            dsn=resolved_url,
            min_size=min_size,
            max_size=max_size,
            command_timeout=30,
            statement_cache_size=0,
        )
    except socket.gaierror as exc:
        host = urlparse(resolved_url).hostname or "<unknown-host>"
        raise RuntimeError(
            f"Database host '{host}' could not be resolved. "
            "If you are using a Supabase direct connection host like "
            "'db.<project-ref>.supabase.co', switch DATABASE_URL to the Supabase "
            "pooler URI from Settings > Database > Connection string."
        ) from exc
    return _POOL


async def init_pool(
    database_url: str | None = None,
    *,
    min_size: int = 1,
    max_size: int = 10,
) -> asyncpg.Pool:
    """Backward-compatible alias for initializing the shared asyncpg pool."""
    return await init_db_pool(database_url, min_size=min_size, max_size=max_size)


async def close_db_pool() -> None:
    """Close the shared asyncpg pool if it exists."""
    global _POOL
    if _POOL is not None:
        await _POOL.close()
        _POOL = None


async def close_pool() -> None:
    """Backward-compatible alias for closing the shared asyncpg pool."""
    await close_db_pool()


def get_db_pool() -> asyncpg.Pool:
    """Return the initialized asyncpg pool.

    Returns:
        The active asyncpg pool.
    Raises:
        RuntimeError: If the pool has not been initialized yet.
    """
    if _POOL is None:
        raise RuntimeError("Database pool has not been initialized")
    return _POOL


@asynccontextmanager
async def db_transaction() -> AsyncIterator[asyncpg.Connection]:
    """Yield a pooled database connection wrapped in a transaction.

    Returns:
        An async iterator of an open transactional connection.
    Raises:
        RuntimeError: If the pool is not initialized.
    """
    pool = get_db_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection


def _record(row: asyncpg.Record | None) -> DatabaseRecord | None:
    """Convert an asyncpg record to a plain dict.

    Params:
        row: Asyncpg record or `None`.
    Returns:
        A plain dictionary or `None`.
    """
    return dict(row) if row is not None else None


async def get_agent(agent_id: str, connection: asyncpg.Connection | None = None) -> DatabaseRecord | None:
    """Fetch a single agent row by ID.

    Params:
        agent_id: Agent UUID string.
        connection: Optional existing transaction connection.
    Returns:
        Agent row as a dictionary or `None`.
    """
    query = "SELECT * FROM agents WHERE id = $1"
    if connection is not None:
        return _record(await connection.fetchrow(query, agent_id))
    pool = get_db_pool()
    async with pool.acquire() as conn:
        return _record(await conn.fetchrow(query, agent_id))


async def get_agent_with_clinic(agent_id: str) -> DatabaseRecord | None:
    """Fetch an agent row joined with its clinic data.

    Params:
        agent_id: Agent UUID string.
    Returns:
        Agent row merged with clinic fields, or None if not found.
    """
    query = """
        SELECT
            a.*,
            c.industry         AS clinic_industry,
            c.timezone         AS clinic_timezone,
            c.working_hours    AS clinic_working_hours,
            c.name             AS clinic_name,
            c.country          AS clinic_country,
            c.phone            AS clinic_phone,
            c.email            AS clinic_email,
            c.address_line1    AS clinic_address_line1,
            c.city             AS clinic_city,
            c.state            AS clinic_state,
            c.zip              AS clinic_zip,
            s.greeting_text    AS greeting_text,
            s.persona_tone     AS persona_tone,
            s.voice_id         AS voice_id,
            s.config_json      AS settings_config_json
        FROM agents a
        LEFT JOIN clinics c ON c.id = a.clinic_id
        LEFT JOIN agent_settings s ON s.agent_id = a.id
        WHERE a.id = $1
    """
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, agent_id)
        return _record(row)


async def update_agent_fields(
    agent_id: str,
    fields: dict[str, Any],
    *,
    connection: asyncpg.Connection | None = None,
) -> DatabaseRecord:
    """Update selected agent columns and return the updated row.

    Params:
        agent_id: Agent UUID string.
        fields: Mapping of column name to new value.
        connection: Optional existing transaction connection.
    Returns:
        Updated agent row.
    Raises:
        ValueError: If `fields` is empty.
        LookupError: If the agent does not exist.
    """
    if not fields:
        raise ValueError("fields must not be empty")

    assignments = [f"{column} = ${index}" for index, column in enumerate(fields.keys(), start=2)]
    query = (
        "UPDATE agents SET "
        + ", ".join(assignments)
        + ", updated_at = NOW() "
        + "WHERE id = $1 RETURNING *"
    )
    params = [agent_id, *fields.values()]

    async def _run(conn: asyncpg.Connection) -> DatabaseRecord:
        row = await conn.fetchrow(query, *params)
        if row is None:
            raise LookupError(f"Agent {agent_id} was not found")
        return dict(row)

    if connection is not None:
        return await _run(connection)

    pool = get_db_pool()
    async with pool.acquire() as conn:
        return await _run(conn)


async def get_next_free_port(
    agent_id: str,
    *,
    connection: asyncpg.Connection | None = None,
) -> int:
    """Atomically reserve the next available port for an agent.

    Params:
        agent_id: Agent UUID string that will own the port.
        connection: Optional transaction connection. Required for multi-step publish flows.
    Returns:
        The reserved port number.
    Raises:
        LookupError: If no free ports remain.
    """

    async def _reserve(conn: asyncpg.Connection) -> int:
        row = await conn.fetchrow(
            """
            SELECT port
            FROM port_registry
            WHERE agent_id IS NULL
            ORDER BY port ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """
        )
        if row is None:
            raise LookupError("No free ports remain in port_registry")

        port = int(row["port"])
        await conn.execute(
            """
            UPDATE port_registry
            SET agent_id = $1, allocated_at = NOW()
            WHERE port = $2
            """,
            agent_id,
            port,
        )
        return port

    if connection is not None:
        return await _reserve(connection)

    async with db_transaction() as conn:
        return await _reserve(conn)


async def release_port(port: int, *, connection: asyncpg.Connection | None = None) -> None:
    """Mark a reserved port as free again.

    Params:
        port: The port number to release.
        connection: Optional existing transaction connection.
    Returns:
        None.
    """
    query = "UPDATE port_registry SET agent_id = NULL, allocated_at = NULL WHERE port = $1"
    if connection is not None:
        await connection.execute(query, port)
        return

    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(query, port)


async def create_call_log(
    *,
    agent_id: str,
    clinic_id: str | None,
    organization_id: str | None,
    twilio_call_sid: str | None,
    livekit_room: str | None,
    caller_phone: str | None,
    status: str = "initiated",
    transcript_text: str | None = None,
    summary: str | None = None,
) -> DatabaseRecord:
    """Insert a new call log row.

    Params:
        agent_id: Owning agent UUID.
        clinic_id: Clinic UUID if known.
        organization_id: Organization UUID if known.
        twilio_call_sid: Twilio Call SID.
        livekit_room: LiveKit room name.
        caller_phone: Caller phone number.
        status: Initial call status.
        transcript_text: Optional initial transcript text.
        summary: Optional initial summary.
    Returns:
        Inserted call log row.
    """
    async with db_transaction() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO call_logs (
                agent_id, clinic_id, organization_id, twilio_call_sid, livekit_room,
                caller_phone, status, transcript_text, summary
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            agent_id,
            clinic_id,
            organization_id,
            twilio_call_sid,
            livekit_room,
            caller_phone,
            status,
            transcript_text,
            summary,
        )
        return dict(row)


async def get_call_log_by_sid(twilio_call_sid: str) -> DatabaseRecord | None:
    """Fetch a call log by Twilio Call SID.

    Params:
        twilio_call_sid: Twilio Call SID.
    Returns:
        Matching call log row or `None`.
    """
    pool = get_db_pool()
    async with pool.acquire() as conn:
        return _record(
            await conn.fetchrow(
                "SELECT * FROM call_logs WHERE twilio_call_sid = $1",
                twilio_call_sid,
            )
        )


async def update_call_log(
    call_log_id: str,
    fields: dict[str, Any],
    *,
    connection: asyncpg.Connection | None = None,
) -> DatabaseRecord:
    """Update a call log and return the new row.

    Params:
        call_log_id: Call log UUID.
        fields: Mapping of fields to update.
        connection: Optional active transaction connection.
    Returns:
        Updated call log row.
    Raises:
        ValueError: If `fields` is empty.
        LookupError: If the call log does not exist.
    """
    if not fields:
        raise ValueError("fields must not be empty")

    assignments = [f"{column} = ${index}" for index, column in enumerate(fields.keys(), start=2)]
    query = "UPDATE call_logs SET " + ", ".join(assignments) + " WHERE id = $1 RETURNING *"
    params = [call_log_id, *fields.values()]

    async def _run(conn: asyncpg.Connection) -> DatabaseRecord:
        row = await conn.fetchrow(query, *params)
        if row is None:
            raise LookupError(f"Call log {call_log_id} was not found")
        return dict(row)

    if connection is not None:
        return await _run(connection)

    pool = get_db_pool()
    async with pool.acquire() as conn:
        return await _run(conn)


async def upsert_analytics_daily(
    *,
    agent_id: str,
    target_date: date,
    total_calls_increment: int = 0,
    completed_calls_increment: int = 0,
    appointments_booked_increment: int = 0,
    total_duration_seconds_increment: int = 0,
    connection: asyncpg.Connection | None = None,
) -> DatabaseRecord:
    """Increment daily analytics counters for an agent.

    Params:
        agent_id: Agent UUID.
        target_date: Analytics bucket date.
        total_calls_increment: Number of calls to add.
        completed_calls_increment: Number of completed calls to add.
        appointments_booked_increment: Number of booked appointments to add.
        total_duration_seconds_increment: Duration delta in seconds.
        connection: Optional transaction connection.
    Returns:
        Updated analytics row.
    """
    query = """
        INSERT INTO analytics_daily (
            agent_id,
            date,
            total_calls,
            completed_calls,
            appointments_booked,
            total_duration_seconds
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (agent_id, date)
        DO UPDATE SET
            total_calls = analytics_daily.total_calls + EXCLUDED.total_calls,
            completed_calls = analytics_daily.completed_calls + EXCLUDED.completed_calls,
            appointments_booked = analytics_daily.appointments_booked + EXCLUDED.appointments_booked,
            total_duration_seconds = analytics_daily.total_duration_seconds + EXCLUDED.total_duration_seconds
        RETURNING *
    """
    params = (
        agent_id,
        target_date,
        total_calls_increment,
        completed_calls_increment,
        appointments_booked_increment,
        total_duration_seconds_increment,
    )

    async def _run(conn: asyncpg.Connection) -> DatabaseRecord:
        row = await conn.fetchrow(query, *params)
        return dict(row)

    if connection is not None:
        return await _run(connection)

    pool = get_db_pool()
    async with pool.acquire() as conn:
        return await _run(conn)


async def create_appointment(
    *,
    agent_id: str,
    organization_id: str | None,
    clinic_id: str | None,
    call_log_id: str | None,
    caller_name: str | None,
    caller_phone: str | None,
    caller_email: str | None,
    service_requested: str | None,
    appointment_at: datetime | None,
    notes: str | None,
    calendar_event_id: str | None = None,
    calendar_event_url: str | None = None,
    confirmation_sent: bool = False,
) -> DatabaseRecord:
    """Insert an appointment row compatible with both old and new schemas.

    Params:
        agent_id: Owning agent UUID.
        organization_id: Organization UUID if known.
        clinic_id: Clinic UUID if known.
        call_log_id: Related call log UUID.
        caller_name: Caller full name.
        caller_phone: Caller phone number.
        caller_email: Caller email.
        service_requested: Service or reason requested.
        appointment_at: Appointment datetime.
        notes: Free-form notes.
        calendar_event_id: Optional Google Calendar event ID.
        calendar_event_url: Optional Google Calendar event URL.
        confirmation_sent: Whether the email confirmation was sent.
    Returns:
        Inserted appointment row.
    """
    start_time = appointment_at
    end_time = appointment_at + timedelta(hours=1) if appointment_at is not None else None

    async with db_transaction() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO appointments (
                agent_id,
                organization_id,
                clinic_id,
                call_log_id,
                call_session_id,
                caller_name,
                caller_phone,
                caller_email,
                patient_name,
                patient_email,
                service_requested,
                reason,
                appointment_at,
                start_time,
                end_time,
                notes,
                calendar_event_id,
                calendar_event_url,
                confirmation_sent
            )
            VALUES (
                $1, $2, $3, $4, NULL, $5, $6, $7, $5, $7, $8, $8, $9, $10, $11, $12, $13, $14, $15
            )
            RETURNING *
            """,
            agent_id,
            organization_id,
            clinic_id,
            call_log_id,
            caller_name,
            caller_phone,
            caller_email,
            service_requested,
            appointment_at,
            start_time,
            end_time,
            notes,
            calendar_event_id,
            calendar_event_url,
            confirmation_sent,
        )
        return dict(row)


async def update_appointment_fields(appointment_id: str, fields: dict[str, Any]) -> DatabaseRecord:
    """Update appointment columns and return the new row.

    Params:
        appointment_id: Appointment UUID.
        fields: Mapping of appointment fields to update.
    Returns:
        Updated appointment row.
    Raises:
        ValueError: If no fields are supplied.
        LookupError: If the appointment does not exist.
    """
    if not fields:
        raise ValueError("fields must not be empty")

    assignments = [f"{column} = ${index}" for index, column in enumerate(fields.keys(), start=2)]
    query = (
        "UPDATE appointments SET "
        + ", ".join(assignments)
        + ", updated_at = NOW() "
        + "WHERE id = $1 RETURNING *"
    )
    params = [appointment_id, *fields.values()]

    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *params)
        if row is None:
            raise LookupError(f"Appointment {appointment_id} was not found")
        return dict(row)


async def list_agent_calls(
    agent_id: str,
    *,
    page: int = 1,
    limit: int = 20,
    status: str | None = None,
) -> list[DatabaseRecord]:
    """List paginated call logs for an agent.

    Params:
        agent_id: Agent UUID.
        page: 1-based page number.
        limit: Page size.
        status: Optional status filter.
    Returns:
        List of call log rows.
    """
    offset = max(page - 1, 0) * limit
    if status and status != "all":
        query = """
            SELECT *
            FROM call_logs
            WHERE agent_id = $1 AND status = $2
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
        """
        params: tuple[Any, ...] = (agent_id, status, limit, offset)
    else:
        query = """
            SELECT *
            FROM call_logs
            WHERE agent_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        """
        params = (agent_id, limit, offset)

    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [dict(row) for row in rows]


async def list_agent_appointments(
    agent_id: str,
    *,
    page: int = 1,
    limit: int = 20,
) -> list[DatabaseRecord]:
    """List paginated appointments for an agent.

    Params:
        agent_id: Agent UUID.
        page: 1-based page number.
        limit: Page size.
    Returns:
        List of appointment rows.
    """
    offset = max(page - 1, 0) * limit
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM appointments
            WHERE agent_id = $1
            ORDER BY COALESCE(appointment_at, created_at) DESC
            LIMIT $2 OFFSET $3
            """,
            agent_id,
            limit,
            offset,
        )
        return [dict(row) for row in rows]


async def get_agent_analytics(agent_id: str, *, days: int = 30) -> list[DatabaseRecord]:
    """Return daily analytics rows for the requested lookback window.

    Params:
        agent_id: Agent UUID.
        days: Number of trailing days to include.
    Returns:
        Daily analytics rows ordered by date descending.
    """
    start_date = datetime.now(timezone.utc).date() - timedelta(days=max(days - 1, 0))
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM analytics_daily
            WHERE agent_id = $1 AND date >= $2
            ORDER BY date DESC
            """,
            agent_id,
            start_date,
        )
        return [dict(row) for row in rows]
