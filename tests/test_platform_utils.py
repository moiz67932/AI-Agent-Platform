from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_platform_utils():
    root = Path(__file__).resolve().parents[1]
    path = root / "agent_platform" / "utils.py"
    spec = importlib.util.spec_from_file_location("voice_platform_utils_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_generate_subdomain_is_stable_and_safe():
    utils = _load_platform_utils()
    subdomain = utils.generate_subdomain("Bright Smile Dental", "550e8400-e29b-41d4-a716-446655440000")
    assert subdomain == "bright-smile-dental-550e8400"
    assert subdomain.replace("-", "").isalnum()


def test_mask_secret_redacts_middle():
    utils = _load_platform_utils()
    assert utils.mask_secret("abcdefghijklmnop") == "abcd...mnop"
    assert utils.mask_secret("secret") == "******"
