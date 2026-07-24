from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str

    # Nano Banana (image generation)
    nano_banana_api_key: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/smm"

    # Tavily
    tavily_api_key: str = ""

    # LinkedIn
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_access_token: str = ""
    linkedin_organization_id: str = ""

    # OpenAI (for embeddings)
    openai_api_key: str = ""

    # Email notifications (Brevo / Sendinblue — no-DNS single-sender verification)
    brevo_api_key: str = ""
    email_from: str = ""          # the sender address verified once in Brevo (no DNS)
    email_from_name: str = ""     # display name; falls back to company_name
    resend_api_key: str = ""      # legacy; unused (kept so old env vars don't error)

    # Branding (single-tenant for now; becomes per-tenant when scaling — see docs/SCALING.md)
    company_name: str = "bizpando AG"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    environment: str = "development"

    # Agent
    claude_model: str = "claude-sonnet-4-6"
    embedding_model: str = "text-embedding-3-small"  # via OpenAI-compat or Voyage
    rag_top_k: int = 3
    style_rules_limit: int = 10

    class Config:
        env_file = ("../.env", ".env")  # look in parent dir first, then current dir
        case_sensitive = False
        extra = "ignore"  # tolerate leftover env keys (e.g. removed integrations)


@lru_cache
def get_settings() -> Settings:
    return Settings()
