"""Telnyx webhook signature verification helpers."""

from __future__ import annotations

import base64
import binascii
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from services.telnyx_client import TelnyxConfig, load_telnyx_config


class TelnyxWebhookVerificationError(ValueError):
    """Raised when a Telnyx webhook fails signature or replay validation."""


class TelnyxWebhookVerifier:
    """Verify Telnyx webhook signatures using the account public key."""

    def __init__(self, config: TelnyxConfig | None = None) -> None:
        self.config = config or load_telnyx_config()

    def verify(self, *, raw_body: bytes, signature: str | None, timestamp: str | None) -> None:
        """Validate the webhook signature and timestamp."""

        if self.config.disable_signature_verification:
            return
        if not self.config.public_key:
            raise TelnyxWebhookVerificationError("TELNYX_PUBLIC_KEY is not configured")
        if not signature or not timestamp:
            raise TelnyxWebhookVerificationError("Missing Telnyx signature headers")

        try:
            sent_at = int(timestamp)
        except ValueError as exc:
            raise TelnyxWebhookVerificationError("Invalid Telnyx timestamp header") from exc

        now = int(time.time())
        if abs(now - sent_at) > self.config.signature_tolerance_secs:
            raise TelnyxWebhookVerificationError("Telnyx webhook timestamp is outside the allowed tolerance")

        public_key = _load_public_key(self.config.public_key)
        signed_payload = f"{timestamp}|{raw_body.decode('utf-8')}".encode("utf-8")
        try:
            signature_bytes = base64.b64decode(signature)
        except binascii.Error as exc:
            raise TelnyxWebhookVerificationError("Invalid Telnyx signature encoding") from exc

        try:
            public_key.verify(signature_bytes, signed_payload)
        except InvalidSignature as exc:
            raise TelnyxWebhookVerificationError("Invalid Telnyx webhook signature") from exc


def _load_public_key(value: str) -> Ed25519PublicKey:
    """Parse a Telnyx public key in hex or base64 form."""

    normalized = value.strip()
    key_bytes: bytes
    try:
        key_bytes = bytes.fromhex(normalized)
    except ValueError:
        try:
            key_bytes = base64.b64decode(normalized)
        except binascii.Error as exc:
            raise TelnyxWebhookVerificationError("TELNYX_PUBLIC_KEY must be hex or base64 encoded") from exc
    if len(key_bytes) != 32:
        raise TelnyxWebhookVerificationError("TELNYX_PUBLIC_KEY must decode to 32 bytes")
    return Ed25519PublicKey.from_public_bytes(key_bytes)
