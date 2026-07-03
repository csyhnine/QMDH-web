import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.integrations.studio_agent.agent import run_studio_agent
from app.models import AgentSkillRelease, ProviderProfile
from app.services.agent_policy_service import EffectiveChatPolicy


class StudioAgentPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            db.add(
                ProviderProfile(
                    provider_name="demo-chat",
                    api_key="plain:test",
                    base_url="https://example.com/v1",
                    model_name="demo-model",
                    adapter_kind="openai_compatible",
                    capabilities=["chat.completions"],
                    enabled=True,
                )
            )
            db.add(
                AgentSkillRelease(
                    key="qmdh-chat-prod",
                    display_name="Prod chat policy",
                    environment="prod",
                    openclaw_version="latest",
                    skill_keys=[],
                    system_prompt_template="Policy overlay",
                    chat_tool_allowlist=["search_shared_templates"],
                    notes="",
                    is_active=True,
                )
            )
            db.commit()

    @patch("app.integrations.studio_agent.agent._PYDANTIC_AI_AVAILABLE", True)
    @patch("app.integrations.studio_agent.agent.OpenAICompatibleModel")
    @patch("app.integrations.studio_agent.agent.OpenAIProvider")
    @patch("app.integrations.studio_agent.agent.Agent")
    @patch("app.integrations.studio_agent.agent._register_chat_tools")
    @patch("app.integrations.studio_agent.agent.resolve_effective_chat_policy")
    def test_run_studio_agent_uses_policy_allowlist(
        self,
        mock_resolve_policy,
        mock_register_tools,
        mock_agent_cls,
        *_mocks,
    ) -> None:
        mock_resolve_policy.return_value = EffectiveChatPolicy(
            policy_version="qmdh-chat-prod",
            release_id=1,
            release_key="qmdh-chat-prod",
            environment="prod",
            system_prompt="baseline\n\nPolicy overlay",
            chat_tool_allowlist=("search_shared_templates",),
        )

        class FakeAgent:
            def __init__(self, model, deps_type=None, system_prompt=""):
                self.system_prompt = system_prompt

            def run_sync(self, message, deps=None):
                return type("Result", (), {"output": "ok"})()

        fake_agent = FakeAgent("", system_prompt="baseline\n\nPolicy overlay")
        mock_agent_cls.return_value = fake_agent

        with self.SessionLocal() as db:
            reply = run_studio_agent(
                db,
                message="你好",
                user_name="tester",
                user_id=1,
                provider_id=1,
            )

        self.assertEqual(reply.policy_version, "qmdh-chat-prod")
        mock_register_tools.assert_called_once()
        _, kwargs = mock_register_tools.call_args
        self.assertEqual(kwargs["allowlist"], ("search_shared_templates",))
