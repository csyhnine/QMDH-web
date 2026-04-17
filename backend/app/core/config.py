from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "QMDH Internal AI Platform"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./app.db"
    frontend_origin: str = "http://localhost:5180"
    task_execution_mode: str = "background"
    redis_url: str = "redis://localhost:6379/0"
    redis_queue_name: str = "qmdh:tasks"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="QMDH_")


settings = Settings()
