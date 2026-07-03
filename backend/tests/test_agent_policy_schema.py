import unittest

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app.services.bootstrap import ensure_schema


class EnsureSchemaAgentPolicyTests(unittest.TestCase):
    def test_ensure_schema_adds_agent_chat_policy_columns(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE agent_skill_releases (
                        id INTEGER PRIMARY KEY,
                        key VARCHAR(100) NOT NULL,
                        display_name VARCHAR(150) NOT NULL,
                        environment VARCHAR(30) NOT NULL,
                        openclaw_version VARCHAR(50) NOT NULL,
                        skill_keys JSON NOT NULL,
                        notes TEXT NOT NULL,
                        is_active BOOLEAN NOT NULL,
                        created_by_user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
                    )
                    """
                )
            )

        ensure_schema(engine)
        columns = {column["name"] for column in inspect(engine).get_columns("agent_skill_releases")}
        self.assertIn("system_prompt_template", columns)
        self.assertIn("chat_tool_allowlist", columns)
