"""
Pipeline Configuration — Centralized builder for English & Urdu pipelines.

Returns STT, LLM, TTS instances and the system prompt template based on
the ACTIVE_PIPELINE config flag. English code is NEVER modified or deleted —
it's simply not routed when Urdu is active.

Usage in agent_v2.py:
    from pipelines import get_pipeline_components
    components = get_pipeline_components()
    stt_instance = components["stt"]
    llm_instance = components["llm"]
    tts_instance = components["tts"]
    system_prompt = components["system_prompt"]
    filler_phrases = components["filler_phrases"]
    greeting = components["greeting"]
"""

from __future__ import annotations

import os
import inspect
import logging
import re
from typing import Dict, Any, Optional

from .azure_tts import create_azure_tts
from .urdu_prompt import URDU_SYSTEM_PROMPT, URDU_FILLER_PHRASES
from config import FILLER_PHRASES

logger = logging.getLogger("snappy_agent")


COMMON_MED_SPA_KEYTERMS = [
    "HydraFacial",
    "Botox",
    "Dysport",
    "Xeomin",
    "filler",
    "dermal filler",
    "Sculptra",
    "Kybella",
    "PDO threads",
    "PRP",
    "PRF",
    "microneedling",
    "exosomes",
    "chemical peel",
    "dermaplaning",
    "Plasma Pen",
    "hair restoration",
    "Skinbetter",
    "ZO Skin Health",
]


def build_stt_keyterms_from_context(
    *,
    clinic_info: Optional[Dict[str, Any]] = None,
    settings: Optional[Dict[str, Any]] = None,
    industry_type: Optional[str] = None,
    knowledge_articles: Optional[list[Dict[str, Any]]] = None,
) -> list[str]:
    """Build Deepgram keyterms from already-loaded runtime context."""
    terms: list[str] = []

    def add(value: Any) -> None:
        text = " ".join(str(value or "").split()).strip()
        if not text or len(text) > 50 or len(text.split()) > 5:
            return
        key = text.lower()
        if key not in {item.lower() for item in terms}:
            terms.append(text)

    clinic_info = clinic_info or {}
    settings = settings or {}
    add(clinic_info.get("name"))
    for field in ("provider_names", "providers", "team_members", "staff"):
        values = clinic_info.get(field) or settings.get(field)
        if isinstance(values, str):
            for part in re.split(r"[,;]\s*", values):
                add(part)
        elif isinstance(values, list):
            for item in values:
                if isinstance(item, dict):
                    add(item.get("name") or item.get("full_name") or item.get("display_name"))
                else:
                    add(item)

    config_json = settings.get("config_json") or {}
    if isinstance(config_json, str):
        try:
            import json
            config_json = json.loads(config_json)
        except Exception:
            config_json = {}
    services = []
    if isinstance(config_json, dict):
        services = config_json.get("services") or config_json.get("service_catalog") or []
    if isinstance(services, list):
        for service in services:
            if isinstance(service, dict):
                add(service.get("name") or service.get("display_name"))
                aliases = service.get("aliases") or service.get("keywords") or []
                if isinstance(aliases, str):
                    aliases = re.split(r"[,;]\s*", aliases)
                if isinstance(aliases, list):
                    for alias in aliases:
                        add(alias)
            else:
                add(service)

    if (industry_type or "").lower() in {"med_spa", "spa", "aesthetics"}:
        for term in COMMON_MED_SPA_KEYTERMS:
            add(term)

    for article in knowledge_articles or []:
        if not isinstance(article, dict):
            continue
        add(article.get("title"))
        body = str(article.get("body") or "")
        for term in COMMON_MED_SPA_KEYTERMS:
            if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", body, flags=re.IGNORECASE):
                add(term)

    return terms[:100]


def build_english_pipeline(
    agent_lang: str = "en-US",
    stt_aggressive: bool = True,
    latency_debug: bool = False,
    stt_keyterms: Optional[list[str]] = None,
) -> Dict[str, Any]:
    """
    Build the original English pipeline components.

    Returns dict with keys: stt, llm, tts, system_prompt_template, filler_phrases, pipeline_name
    This is the EXACT same logic previously in entrypoint(), just extracted.
    """
    from livekit.plugins import (
        openai as openai_plugin,
        deepgram as deepgram_plugin,
        cartesia as cartesia_plugin,
    )

    # --- STT (Deepgram English) ---
    if os.getenv("DEEPGRAM_API_KEY"):
        stt_config: Dict[str, Any] = {
            "model": "nova-2-general",
            "language": agent_lang,
        }
        keyterms = [term for term in (stt_keyterms or []) if term]
        if keyterms:
            try:
                stt_sig = inspect.signature(deepgram_plugin.STT.__init__)
                stt_params = set(stt_sig.parameters.keys())
                if "keyterm" in stt_params or "kwargs" in str(stt_sig):
                    stt_config["keyterm"] = keyterms
                elif "keywords" in stt_params:
                    stt_config["keywords"] = keyterms
                logger.info("[STT-EN] Deepgram keyterms enabled count=%s", len(keyterms))
            except Exception:
                pass
        if stt_aggressive:
            try:
                stt_sig = inspect.signature(deepgram_plugin.STT.__init__)
                stt_params = set(stt_sig.parameters.keys())
                if "endpointing" in stt_params or "kwargs" in str(stt_sig):
                    # TELEPHONY TUNING (2026-03-08):
                    # endpointing: 300ms → 200ms (how long Deepgram waits after
                    # silence before emitting a final transcript).
                    # utterance_end_ms: 1000ms → 800ms (inter-utterance gap).
                    # Increase back toward 300/1000 if callers get cut off mid-sentence.
                    stt_config["endpointing"] = 200
                    stt_config["utterance_end_ms"] = 800
                    if latency_debug:
                        logger.debug("[STT-EN] Deepgram telephony endpointing: 200ms / utt_end=800ms")
            except Exception:
                pass
        stt_instance = deepgram_plugin.STT(**stt_config)
    else:
        stt_instance = openai_plugin.STT(model="gpt-4o-transcribe", language="en")

    # --- LLM (OpenAI gpt-4o-mini) ---
    llm_instance = openai_plugin.LLM(
        model="gpt-4o-mini",
        temperature=0.7,
    )

    # --- TTS (Cartesia or OpenAI fallback) ---
    if os.getenv("CARTESIA_API_KEY"):
        tts_instance = cartesia_plugin.TTS(
            model="sonic-3",
            voice=os.getenv("CARTESIA_VOICE_ID", "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
        )
    else:
        tts_instance = openai_plugin.TTS(model="tts-1", voice="alloy")

    logger.info("[PIPELINE-EN] ✓ English pipeline built (Deepgram STT + GPT-4o-mini + Cartesia TTS)")

    return {
        "stt": stt_instance,
        "llm": llm_instance,
        "tts": tts_instance,
        "system_prompt_template": None,  # Use existing A_TIER_PROMPT in agent_v2.py
        "filler_phrases": FILLER_PHRASES,
        "pipeline_name": "english",
    }


def build_urdu_pipeline(
    latency_debug: bool = False,
) -> Dict[str, Any]:
    """
    Build the Urdu pipeline components.

    STT:  Deepgram with language="hi" (Hindi — closest to Urdu supported by Nova-2)
    LLM:  OpenAI gpt-4o-mini (prompted in Urdu)
    TTS:  Azure Speech (ur-PK-UzmaNeural or ur-PK-AsadNeural)

    Returns dict with keys: stt, llm, tts, system_prompt_template, filler_phrases, pipeline_name
    """
    from livekit.plugins import (
        openai as openai_plugin,
        deepgram as deepgram_plugin,
    )

    urdu_stt_lang = os.getenv("URDU_STT_LANGUAGE", "hi")
    urdu_llm_model = os.getenv("URDU_LLM_MODEL", "gpt-4o-mini")
    urdu_tts_voice = os.getenv("URDU_TTS_VOICE", "ur-PK-UzmaNeural")

    # --- STT (Deepgram — Urdu not natively supported by Nova-2, use multi/hi) ---
    if not os.getenv("DEEPGRAM_API_KEY"):
        raise RuntimeError(
            "Urdu STT requires DEEPGRAM_API_KEY."
        )

    stt_config: Dict[str, Any] = {
        "model": "nova-2-general",
    }
    
    # Handle "multi" by enabling detect_language=True instead of setting language="multi"
    # Deepgram rejects "multi" as a language code.
    if urdu_stt_lang.lower() == "multi":
        stt_config["detect_language"] = True
    else:
        stt_config["language"] = urdu_stt_lang

    # Telephony endpointing for Urdu (same tuning as English)
    try:
        stt_sig = inspect.signature(deepgram_plugin.STT.__init__)
        stt_params = set(stt_sig.parameters.keys())
        if "endpointing" in stt_params or "kwargs" in str(stt_sig):
            stt_config["endpointing"] = 200
            stt_config["utterance_end_ms"] = 800
            if latency_debug:
                logger.debug("[STT-UR] Deepgram Urdu telephony endpointing: 200ms / utt_end=800ms")
    except Exception:
        pass

    stt_instance = deepgram_plugin.STT(**stt_config)
    
    stt_mode_log = "auto-detect" if stt_config.get("detect_language") else f"language={urdu_stt_lang}"
    logger.info(f"[STT-UR] ✓ Deepgram STT initialized with {stt_mode_log}")

    # --- LLM (OpenAI — must respond in Urdu via system prompt) ---
    llm_instance = openai_plugin.LLM(
        model=urdu_llm_model,
        temperature=0.7,
    )
    logger.info(f"[LLM-UR] ✓ OpenAI LLM initialized with model={urdu_llm_model}")

    # --- TTS (Azure Speech — Urdu Pakistan neural voice) ---
    tts_instance = create_azure_tts(voice=urdu_tts_voice)

    logger.info("[PIPELINE-UR] ✓ Urdu pipeline built (Deepgram ur STT + GPT-4o-mini + Azure ur-PK TTS)")

    return {
        "stt": stt_instance,
        "llm": llm_instance,
        "tts": tts_instance,
        "system_prompt_template": URDU_SYSTEM_PROMPT,
        "filler_phrases": URDU_FILLER_PHRASES,
        "pipeline_name": "urdu",
    }


def get_pipeline_components(
    active_pipeline: Optional[str] = None,
    agent_lang: str = "en-US",
    stt_aggressive: bool = True,
    latency_debug: bool = False,
    stt_keyterms: Optional[list[str]] = None,
) -> Dict[str, Any]:
    """
    Master router — returns the correct pipeline components based on config.

    Args:
        active_pipeline: "english" or "urdu". If None, reads from ACTIVE_PIPELINE env var.
        agent_lang: Language code for English STT (ignored for Urdu).
        stt_aggressive: Enable aggressive endpointing.
        latency_debug: Enable latency debug logging.

    Returns:
        Dict with keys: stt, llm, tts, system_prompt_template, filler_phrases, pipeline_name
    """
    if active_pipeline is None:
        active_pipeline = os.getenv("ACTIVE_PIPELINE", "english").strip().lower()

    if active_pipeline == "urdu":
        logger.info("[PIPELINE] 🇵🇰 Activating URDU pipeline")
        return build_urdu_pipeline(latency_debug=latency_debug)
    else:
        logger.info("[PIPELINE] 🇺🇸 Activating ENGLISH pipeline")
        return build_english_pipeline(
            agent_lang=agent_lang,
            stt_aggressive=stt_aggressive,
            latency_debug=latency_debug,
            stt_keyterms=stt_keyterms,
        )
