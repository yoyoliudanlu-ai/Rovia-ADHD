"""Supabase client helpers."""

from __future__ import annotations

import os
from pathlib import Path
from supabase import create_client

_CLIENT = None


def _load_env_value(name: str) -> str | None:
    direct = os.getenv(name)
    if direct:
      return direct

    env_file = Path(__file__).resolve().parents[2] / ".env"
    if not env_file.exists():
      return None

    for line in env_file.read_text().splitlines():
      text = line.strip()
      if not text or text.startswith("#") or "=" not in text:
        continue
      key, _, value = text.partition("=")
      if key.strip() == name:
        return value.strip()

    return None


def create_supabase_from_env():
    url = _load_env_value("SUPABASE_URL")
    key = _load_env_value("SUPABASE_KEY") or _load_env_value("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY/SUPABASE_ANON_KEY must be set in environment"
        )
    return create_client(url, key)


def get_supabase_client():
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = create_supabase_from_env()
    return _CLIENT
