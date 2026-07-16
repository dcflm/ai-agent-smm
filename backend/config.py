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

    # Notion
    notion_token: str = ""
    notion_database_id: str = ""
    notion_webhook_secret: str = ""

    # LinkedIn
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_access_token: str = ""
    linkedin_organization_id: str = ""

    # OpenAI (for embeddings)
    openai_api_key: str = ""

    # Email notifications (Resend)
    resend_api_key: str = ""
    email_from: str = "onboarding@resend.dev"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
