"""
Database access via Supabase Python client (REST API).
This avoids direct PostgreSQL TCP connections which can fail on some networks.
"""
from supabase import create_client, Client
from backend.config import get_settings


def get_supabase() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
