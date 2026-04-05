"""Supabase client helpers."""

from __future__ import annotations

import os
from supabase import create_client

_CLIENT = None


def create_supabase_from_env():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment")
    return create_client(url, key)


def get_supabase_client():
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = create_supabase_from_env()
    return _CLIENT
