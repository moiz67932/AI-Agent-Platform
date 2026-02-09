"""
Pipeline module — Houses Urdu voice pipeline components.

The English pipeline remains in agent_v2.py (untouched).
This module provides the URDU-specific STT, TTS, LLM config, and prompt
that are swapped in at runtime when ACTIVE_PIPELINE=urdu.
"""

from .urdu_prompt import URDU_SYSTEM_PROMPT, URDU_FILLER_PHRASES
from .azure_tts import create_azure_tts
from .pipeline_config import build_urdu_pipeline, build_english_pipeline, get_pipeline_components

__all__ = [
    "URDU_SYSTEM_PROMPT",
    "URDU_FILLER_PHRASES",
    "create_azure_tts",
    "build_urdu_pipeline",
    "build_english_pipeline",
    "get_pipeline_components",
]
