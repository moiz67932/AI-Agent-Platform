"""Remote deployment manager for per-agent webhook and worker processes."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import pathlib
import posixpath
import shlex
import time
from pathlib import Path
from typing import Any

import aiohttp
import paramiko
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from agent_platform.utils import mask_secret
from utils.livekit_config import normalize_livekit_sip_host

logger = logging.getLogger("voice_platform.server_manager")


def normalize_key_path(path: str) -> str:
    """
    Normalize SSH key path for cross-platform compatibility.
    Handles Windows backslashes, forward slashes, ~ expansion,
    and accidental .pub extension.
    """
    if not path:
        raise ValueError("HETZNER_SSH_KEY_PATH is not set in .env")
    path = path.replace("\\", "/")
    path = os.path.expanduser(path)
    if path.endswith(".pub"):
        path = path[:-4]
        logger.warning("[SSH] .pub extension stripped - using private key")
    return str(pathlib.Path(path))


def load_ssh_key(key_path: str) -> paramiko.PKey:
    """
    Auto-detect SSH key type and load it.
    Tries Ed25519 first (most common modern key), then RSA, then ECDSA.
    Provides clear error messages for common failures.
    """
    normalized = normalize_key_path(key_path)
    if not os.path.exists(normalized):
        raise FileNotFoundError(
            f"SSH key not found at: {normalized}\n"
            f"Original path: {key_path}\n"
            "Check HETZNER_SSH_KEY_PATH in your .env file.\n"
            "On Windows, use forward slashes: C:/Users/Name/.ssh/id_ed25519"
        )
    for key_class in [paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey]:
        try:
            key = key_class.from_private_key_file(normalized)
            logger.info("[SSH] Loaded %s from ...%s", key_class.__name__, normalized[-30:])
            return key
        except paramiko.ssh_exception.SSHException:
            continue
        except Exception:
            continue
    raise ValueError(
        f"Could not load SSH key from {normalized}.\n"
        "Tried Ed25519, RSA, and ECDSA formats.\n"
        "Verify the file is a valid SSH private key (not .pub)."
    )


class AgentServerManager:
    """Deploy, remove, inspect, and restart tenant-specific agent runtimes over SSH."""

    RUNTIME_PATHS = (
        "agent.py",
        "agent_wrapper.py",
        "config.py",
        "post_call_pipeline.py",
        "requirements.txt",
        "supabase_calendar_store.py",
        "webhook_server.py",
        "worker_main.py",
        "database",
        "industry_profiles",
        "models",
        "pipelines",
        "prompts",
        "services",
        "tools",
        "utils",
    )

    def __init__(
        self,
        *,
        host: str | None = None,
        username: str = "root",
        key_path: str | None = None,
        agents_domain: str | None = None,
        base_remote_dir: str = "/opt/agents",
        log_dir: str = "/var/log/agents",
        local_root: str | Path | None = None,
    ) -> None:
        """Initialize the SSH-backed deployment manager."""
        resolved_host = host or os.getenv("HETZNER_SERVER_IP")
        resolved_key = normalize_key_path(key_path or os.getenv("HETZNER_SSH_KEY_PATH", ""))
        if not resolved_host:
            raise RuntimeError("HETZNER_SERVER_IP is required")
        if not resolved_key:
            raise RuntimeError("HETZNER_SSH_KEY_PATH is required")

        self.host = resolved_host
        self.username = username
        self.key_path = resolved_key
        self.agents_domain = (agents_domain or os.getenv("AGENTS_DOMAIN", "localhost")).strip()
        self.base_remote_dir = base_remote_dir.rstrip("/")
        self.log_dir = log_dir.rstrip("/")
        self.local_root = Path(local_root or Path(__file__).resolve().parents[1])

    def _remote_dir(self, agent_id: str) -> str:
        """Return the remote directory for an agent deployment."""
        return f"{self.base_remote_dir}/agent-{agent_id}"

    def _supervisor_conf_path(self, agent_id: str) -> str:
        """Return the supervisor config path for an agent."""
        return f"/etc/supervisor/conf.d/agent-{agent_id}.conf"

    def _nginx_conf_path(self, subdomain: str) -> str:
        """Return the nginx config path for an agent subdomain."""
        return f"/etc/nginx/sites-enabled/{subdomain}.conf"

    def build_webhook_base_url(self, subdomain: str, port: int) -> str:
        """Build the public or local webhook base URL for an agent."""
        if self.agents_domain == "localhost":
            return f"http://{self.host}:{port}"
        return f"https://{subdomain}.{self.agents_domain}"

    def _build_env_map(self, agent_id: str, agent_config: dict[str, Any], port: int, subdomain: str) -> dict[str, str]:
        """Build the environment file contents for a deployed agent."""
        webhook_base_url = self.build_webhook_base_url(subdomain, port)
        worker_port = int(agent_config.get("worker_port") or (port + 1000))
        livekit_agent_name = str(
            agent_config.get("livekit_agent_name")
            or os.getenv("LIVEKIT_AGENT_NAME")
            or f"agent-{agent_id.replace('-', '')[:12]}"
        )

        env_map: dict[str, str] = {
            "AGENT_ID": agent_id,
            "AGENT_CONFIG": json.dumps(agent_config, separators=(",", ":"), ensure_ascii=True),
            "AGENTS_DOMAIN": self.agents_domain,
            "DATABASE_URL": os.getenv("DATABASE_URL", ""),
            "EMAIL_FROM": os.getenv("EMAIL_FROM", ""),
            "ENVIRONMENT": os.getenv("ENVIRONMENT", "production"),
            "GOOGLE_CREDENTIALS_JSON": os.getenv("GOOGLE_CREDENTIALS_JSON", ""),
            "HETZNER_SERVER_IP": self.host,
            "INTERNAL_SECRET": os.getenv("INTERNAL_SECRET", ""),
            "LIVEKIT_AGENT_NAME": livekit_agent_name,
            "LIVEKIT_API_KEY": os.getenv("LIVEKIT_API_KEY", ""),
            "LIVEKIT_API_SECRET": os.getenv("LIVEKIT_API_SECRET", ""),
            "LIVEKIT_SIP_HOST": normalize_livekit_sip_host(os.getenv("LIVEKIT_SIP_HOST", "")),
            "LIVEKIT_URL": os.getenv("LIVEKIT_URL", ""),
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
            "PORT": str(port),
            "RESEND_API_KEY": os.getenv("RESEND_API_KEY", ""),
            "SENTRY_DSN": os.getenv("SENTRY_DSN", ""),
            "SIP_AUTH_PASSWORD": str(agent_config.get("sip_auth_password", "")),
            "SIP_AUTH_USERNAME": str(agent_config.get("sip_auth_username", "")),
            "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
            "SUPABASE_URL": os.getenv("SUPABASE_URL", ""),
            "TWILIO_AUTH_TOKEN": os.getenv("TWILIO_AUTH_TOKEN", ""),
            "TWILIO_ACCOUNT_SID": os.getenv("TWILIO_ACCOUNT_SID", ""),
            "WEBHOOK_BASE_URL": webhook_base_url,
            "WORKER_PORT": str(worker_port),
        }

        default_test_number = str(
            agent_config.get("phone_number")
            or agent_config.get("default_test_number")
            or ""
        ).strip()
        if default_test_number:
            env_map["DEFAULT_TEST_NUMBER"] = default_test_number

        return env_map

    def _render_env_file(self, env_map: dict[str, str]) -> str:
        """Serialize an environment mapping into dotenv format."""
        lines: list[str] = []
        for key in sorted(env_map.keys()):
            value = str(env_map[key] or "")
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'{key}="{escaped}"')
        return "\n".join(lines) + "\n"

    def _render_supervisor_config(self, agent_id: str, remote_dir: str, port: int) -> str:
        """Render the supervisor config for the worker and webhook processes."""
        worker_name = f"agent-{agent_id}-worker"
        web_name = f"agent-{agent_id}-web"
        python_bin = posixpath.join(remote_dir, ".venv", "bin", "python")
        uvicorn_bin = posixpath.join(remote_dir, ".venv", "bin", "uvicorn")
        webhook_host = "0.0.0.0" if self.agents_domain == "localhost" else "127.0.0.1"
        return f"""
[program:{worker_name}]
directory={remote_dir}
command={python_bin} worker_main.py
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile={self.log_dir}/{worker_name}.out.log
stderr_logfile={self.log_dir}/{worker_name}.err.log
environment=PYTHONUNBUFFERED="1"

[program:{web_name}]
directory={remote_dir}
command={uvicorn_bin} webhook_server:app --host {webhook_host} --port {port}
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile={self.log_dir}/{web_name}.out.log
stderr_logfile={self.log_dir}/{web_name}.err.log
environment=PYTHONUNBUFFERED="1"
""".strip() + "\n"

    def _render_nginx_config(self, subdomain: str, port: int) -> str:
        """Render the nginx site config for the FastAPI webhook."""
        fqdn = f"{subdomain}.{self.agents_domain}"
        return f"""
server {{
    listen 80;
    server_name {fqdn};

    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
""".strip() + "\n"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((OSError, paramiko.SSHException)),
        reraise=True,
    )
    def _connect(self) -> paramiko.SSHClient:
        """Open a Paramiko SSH connection with retry semantics."""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        server_ip = self.host
        key_path = self.key_path
        loaded_key = load_ssh_key(key_path)
        try:
            client.connect(
                hostname=server_ip,
                username="root",
                pkey=loaded_key,
                look_for_keys=False,
                allow_agent=False,
                timeout=30,
                banner_timeout=30,
                auth_timeout=30,
            )
        except Exception as e:
            raise RuntimeError(
                f"SSH connection to {server_ip} failed: {e}\n"
                f"Verify with: ssh -i {key_path} root@{server_ip}"
            ) from e
        return client

    def _exec(self, client: paramiko.SSHClient, command: str, *, check: bool = True) -> str:
        """Execute a shell command over SSH and return stdout."""
        sanitized = command
        for secret_name in ("LIVEKIT_API_SECRET", "TWILIO_AUTH_TOKEN", "SIP_AUTH_PASSWORD", "OPENAI_API_KEY"):
            secret_value = os.getenv(secret_name)
            if secret_value:
                sanitized = sanitized.replace(secret_value, mask_secret(secret_value))
        logger.info("SSH exec: %s", sanitized)
        stdin, stdout, stderr = client.exec_command(command)
        exit_code = stdout.channel.recv_exit_status()
        stdout_text = stdout.read().decode("utf-8", "ignore")
        stderr_text = stderr.read().decode("utf-8", "ignore")
        if check and exit_code != 0:
            raise RuntimeError(f"Remote command failed ({exit_code}): {stderr_text or stdout_text}")
        return stdout_text.strip()

    def _ensure_remote_parent(self, client: paramiko.SSHClient, remote_dir: str) -> None:
        """Create the remote base directories needed for deployment."""
        self._exec(
            client,
            "mkdir -p "
            + " ".join(
                shlex.quote(path)
                for path in (
                    remote_dir,
                    self.base_remote_dir,
                    self.log_dir,
                )
            ),
        )

    def _write_remote_file(self, sftp: paramiko.SFTPClient, remote_path: str, content: str) -> None:
        """Write text content to a remote file via SFTP."""
        with sftp.file(remote_path, "w") as remote_file:
            remote_file.write(content)

    def _mkdirs(self, sftp: paramiko.SFTPClient, remote_dir: str) -> None:
        """Recursively ensure a remote directory exists."""
        parts = [part for part in remote_dir.split("/") if part]
        cursor = "/"
        for part in parts:
            cursor = posixpath.join(cursor, part)
            try:
                sftp.stat(cursor)
            except IOError:
                sftp.mkdir(cursor)

    def _upload_path(self, sftp: paramiko.SFTPClient, local_path: Path, remote_root: str) -> None:
        """Upload a file or directory recursively into the deployment directory."""
        relative = local_path.relative_to(self.local_root)
        remote_path = posixpath.join(remote_root, str(relative).replace("\\", "/"))
        if local_path.is_dir():
            self._mkdirs(sftp, remote_path)
            for child in local_path.iterdir():
                self._upload_path(sftp, child, remote_root)
            return

        self._mkdirs(sftp, posixpath.dirname(remote_path))
        sftp.put(str(local_path), remote_path)

    def _upload_runtime_bundle(self, client: paramiko.SSHClient, remote_dir: str) -> None:
        """Upload the Python runtime files needed by the deployed agent."""
        sftp = client.open_sftp()
        try:
            for relative_path in self.RUNTIME_PATHS:
                local_path = self.local_root / relative_path
                if not local_path.exists():
                    raise FileNotFoundError(f"Required runtime path not found: {local_path}")
                self._upload_path(sftp, local_path, remote_dir)
        finally:
            sftp.close()

    def _clear_remote_runtime_bundle(self, client: paramiko.SSHClient, remote_dir: str) -> None:
        """Remove previously uploaded runtime paths before a code sync."""
        targets = [
            posixpath.join(remote_dir, relative_path.replace("\\", "/"))
            for relative_path in self.RUNTIME_PATHS
        ]
        if not targets:
            return
        self._exec(
            client,
            "rm -rf " + " ".join(shlex.quote(path) for path in targets),
            check=False,
        )

    def _sync_remote_env(self, client: paramiko.SSHClient, agent_id: str, env_content: str) -> None:
        """Write the `.env` file for a remote deployment."""
        remote_dir = self._remote_dir(agent_id)
        sftp = client.open_sftp()
        try:
            self._write_remote_file(sftp, posixpath.join(remote_dir, ".env"), env_content)
        finally:
            sftp.close()

    def _read_remote_env(self, client: paramiko.SSHClient, agent_id: str) -> dict[str, str]:
        """Read and parse the remote `.env` file for a deployment."""
        remote_dir = self._remote_dir(agent_id)
        sftp = client.open_sftp()
        try:
            with sftp.open(posixpath.join(remote_dir, ".env"), "r") as handle:
                content = handle.read().decode("utf-8")
        finally:
            sftp.close()
        return self._parse_env_content(content)

    @staticmethod
    def _parse_env_content(content: str) -> dict[str, str]:
        """Parse a simple dotenv file produced by `_render_env_file`."""
        parsed: dict[str, str] = {}
        for raw_line in content.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            key, sep, raw_value = line.partition("=")
            if not sep:
                continue
            value = raw_value
            if len(value) >= 2 and value.startswith('"') and value.endswith('"'):
                value = value[1:-1].replace("\\\\", "\\").replace('\\"', '"')
            parsed[key] = value
        return parsed

    async def sync_agent_env(self, agent_id: str, agent_config: dict[str, Any], port: int, subdomain: str) -> None:
        """Rewrite the remote `.env` file and restart supervisor programs."""
        env_content = self._render_env_file(self._build_env_map(agent_id, agent_config, port, subdomain))

        def _sync() -> None:
            client = self._connect()
            try:
                self._sync_remote_env(client, agent_id, env_content)
                self._exec(client, f"supervisorctl restart agent-{agent_id}-worker agent-{agent_id}-web", check=False)
            finally:
                client.close()

        await asyncio.to_thread(_sync)

    async def verify_remote_env(
        self,
        agent_id: str,
        agent_config: dict[str, Any],
        port: int,
        subdomain: str,
        *,
        keys: tuple[str, ...] | None = None,
        attempts: int = 5,
        delay_seconds: float = 1.0,
    ) -> None:
        """Verify that the remote `.env` contains the expected values."""
        expected = self._build_env_map(agent_id, agent_config, port, subdomain)
        keys_to_check = keys or (
            "LIVEKIT_SIP_HOST",
            "LIVEKIT_AGENT_NAME",
            "SIP_AUTH_USERNAME",
            "SIP_AUTH_PASSWORD",
            "DEFAULT_TEST_NUMBER",
            "PORT",
            "WORKER_PORT",
            "WEBHOOK_BASE_URL",
        )

        def _verify_once() -> dict[str, tuple[str, str]]:
            client = self._connect()
            try:
                remote_env = self._read_remote_env(client, agent_id)
            finally:
                client.close()

            mismatches: dict[str, tuple[str, str]] = {}
            for key in keys_to_check:
                expected_value = str(expected.get(key, ""))
                actual_value = str(remote_env.get(key, ""))
                if actual_value != expected_value:
                    mismatches[key] = (expected_value, actual_value)
            return mismatches

        mismatches: dict[str, tuple[str, str]] = {}
        for attempt in range(attempts):
            mismatches = await asyncio.to_thread(_verify_once)
            if not mismatches:
                return
            if attempt < attempts - 1:
                await asyncio.sleep(delay_seconds)

        mismatch_summary = ", ".join(
            f"{key}=expected({mask_secret(expected_value)}) actual({mask_secret(actual_value)})"
            for key, (expected_value, actual_value) in mismatches.items()
        )
        raise RuntimeError(f"Remote env verification failed for agent {agent_id}: {mismatch_summary}")

    def _write_process_configs(
        self,
        client: paramiko.SSHClient,
        agent_id: str,
        remote_dir: str,
        subdomain: str,
        port: int,
    ) -> None:
        """Write supervisor and nginx configs for the tenant runtime."""
        supervisor_conf = self._render_supervisor_config(agent_id, remote_dir, port)
        nginx_conf = self._render_nginx_config(subdomain, port)

        sftp = client.open_sftp()
        try:
            self._write_remote_file(sftp, self._supervisor_conf_path(agent_id), supervisor_conf)
            if self.agents_domain != "localhost":
                self._write_remote_file(sftp, self._nginx_conf_path(subdomain), nginx_conf)
        finally:
            sftp.close()

    def _install_runtime_dependencies(self, client: paramiko.SSHClient, remote_dir: str) -> None:
        """Create the venv if needed and install the uploaded Python dependencies."""
        self._exec(
            client,
            " && ".join(
                (
                    f"cd {shlex.quote(remote_dir)}",
                    "python3 -m venv .venv",
                    ".venv/bin/pip install --upgrade pip",
                    ".venv/bin/pip install -r requirements.txt",
                )
            ),
        )

    def _reload_runtime_processes(self, client: paramiko.SSHClient, agent_id: str) -> None:
        """Reload supervisor and nginx so the updated runtime starts serving traffic."""
        self._exec(client, "supervisorctl reread", check=False)
        self._exec(client, "supervisorctl update", check=False)
        self._exec(client, f"supervisorctl restart agent-{agent_id}-worker agent-{agent_id}-web", check=False)

        if self.agents_domain != "localhost":
            self._exec(client, "nginx -t")
            self._exec(client, "systemctl reload nginx")

    async def _deploy_runtime(
        self,
        agent_id: str,
        agent_config: dict[str, Any],
        port: int,
        subdomain: str,
        *,
        clean_runtime_paths: bool,
    ) -> dict[str, Any]:
        """Upload runtime code, sync env/config, and wait for health."""
        env_map = self._build_env_map(agent_id, agent_config, port, subdomain)
        env_content = self._render_env_file(env_map)
        remote_dir = self._remote_dir(agent_id)
        health_url = f"{self.build_webhook_base_url(subdomain, port)}/health"
        logger.info(
            "Preparing runtime sync for agent=%s port=%s worker_port=%s webhook_base=%s clean=%s",
            agent_id,
            port,
            env_map["WORKER_PORT"],
            self.build_webhook_base_url(subdomain, port),
            clean_runtime_paths,
        )

        def _deploy() -> None:
            client = self._connect()
            try:
                self._ensure_remote_parent(client, remote_dir)
                if clean_runtime_paths:
                    self._clear_remote_runtime_bundle(client, remote_dir)
                self._upload_runtime_bundle(client, remote_dir)
                self._sync_remote_env(client, agent_id, env_content)
                self._write_process_configs(client, agent_id, remote_dir, subdomain, port)
                self._install_runtime_dependencies(client, remote_dir)
                self._reload_runtime_processes(client, agent_id)
            finally:
                client.close()

        await asyncio.to_thread(_deploy)
        await self._poll_health(health_url)
        return {
            "agent_id": agent_id,
            "health_url": health_url,
            "remote_dir": remote_dir,
            "webhook_base_url": self.build_webhook_base_url(subdomain, port),
        }

    async def deploy_agent(self, agent_id: str, agent_config: dict[str, Any], port: int, subdomain: str) -> dict[str, Any]:
        """Deploy a tenant runtime and wait for its health endpoint to respond."""
        return await self._deploy_runtime(
            agent_id,
            agent_config,
            port,
            subdomain,
            clean_runtime_paths=False,
        )

    async def redeploy_agent(self, agent_id: str, agent_config: dict[str, Any], port: int, subdomain: str) -> dict[str, Any]:
        """Re-upload a live tenant runtime so local code changes reach the server."""
        return await self._deploy_runtime(
            agent_id,
            agent_config,
            port,
            subdomain,
            clean_runtime_paths=True,
        )

    async def remove_agent(self, agent_id: str, port: int | None, subdomain: str | None) -> None:
        """Remove a deployed tenant runtime and its remote configs."""
        remote_dir = self._remote_dir(agent_id)
        worker_port = int(port + 1000) if port is not None else None

        def _remove() -> None:
            client = self._connect()
            try:
                self._exec(client, f"supervisorctl stop agent-{agent_id}-worker agent-{agent_id}-web", check=False)
                self._exec(client, f"rm -f {shlex.quote(self._supervisor_conf_path(agent_id))}", check=False)
                if self.agents_domain != "localhost" and subdomain:
                    self._exec(client, f"rm -f {shlex.quote(self._nginx_conf_path(subdomain))}", check=False)
                if port is not None:
                    self._exec(
                        client,
                        f"for p in {int(port)} {worker_port}; do "
                        f"for pid in $(lsof -ti tcp:$p 2>/dev/null); do kill -9 $pid; done; "
                        "done",
                        check=False,
                    )
                self._exec(client, f"rm -rf {shlex.quote(remote_dir)}", check=False)
                self._exec(client, "supervisorctl reread", check=False)
                self._exec(client, "supervisorctl update", check=False)
                if self.agents_domain != "localhost":
                    self._exec(client, "nginx -t", check=False)
                    self._exec(client, "systemctl reload nginx", check=False)
            finally:
                client.close()

        await asyncio.to_thread(_remove)

    async def restart_agent(self, agent_id: str) -> None:
        """Restart both supervisor programs for a deployed agent."""
        def _restart() -> None:
            client = self._connect()
            try:
                self._exec(client, f"supervisorctl restart agent-{agent_id}-worker agent-{agent_id}-web")
            finally:
                client.close()

        await asyncio.to_thread(_restart)

    async def tail_logs(self, agent_id: str, *, lines: int = 50) -> str:
        """Return the latest combined supervisor logs for an agent."""
        def _tail() -> str:
            client = self._connect()
            try:
                files = [
                    f"{self.log_dir}/agent-{agent_id}-worker.out.log",
                    f"{self.log_dir}/agent-{agent_id}-worker.err.log",
                    f"{self.log_dir}/agent-{agent_id}-web.out.log",
                    f"{self.log_dir}/agent-{agent_id}-web.err.log",
                ]
                command = (
                    "for f in "
                    + " ".join(shlex.quote(path) for path in files)
                    + "; do if [ -f \"$f\" ]; then echo \"===== $f =====\"; tail -n "
                    + str(lines)
                    + " \"$f\"; fi; done"
                )
                return self._exec(client, command, check=False)
            finally:
                client.close()

        return await asyncio.to_thread(_tail)

    async def get_agent_status(self, agent_id: str) -> dict[str, str]:
        """Fetch supervisor process status for the agent runtime."""
        def _status() -> dict[str, str]:
            client = self._connect()
            try:
                output = self._exec(
                    client,
                    f"supervisorctl status agent-{agent_id}-worker agent-{agent_id}-web",
                    check=False,
                )
            finally:
                client.close()
            statuses: dict[str, str] = {}
            for line in output.splitlines():
                if not line.strip():
                    continue
                parts = line.split(None, 2)
                if len(parts) >= 2:
                    statuses[parts[0]] = parts[1]
            return statuses

        return await asyncio.to_thread(_status)

    async def _poll_health(self, health_url: str, *, timeout_seconds: int = 90) -> None:
        """Poll the webhook health endpoint until it becomes ready."""
        logger.info("Polling agent health at %s", health_url)
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        async with aiohttp.ClientSession() as session:
            while asyncio.get_running_loop().time() < deadline:
                try:
                    async with session.get(health_url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                        if response.status == 200:
                            return
                except aiohttp.ClientError:
                    pass
                await asyncio.sleep(3)
        raise TimeoutError(f"Agent health check timed out for {health_url}")
