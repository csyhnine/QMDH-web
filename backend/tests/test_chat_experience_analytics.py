import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import ChatTurnTelemetry, Conversation, User
from app.services.chat_telemetry_dashboard_service import get_chat_experience_overview, list_chat_turns


class ChatExperienceAnalyticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            user = User(name="designer.arch", display_name="Designer", role="designer", password_hash="unused", is_active=True)
            db.add(user)
            db.flush()
            conversation = Conversation(user_id=user.id, title="demo", model_provider_id=1)
            db.add(conversation)
            db.flush()

            db.add_all(
                [
                    ChatTurnTelemetry(
                        correlation_id="cid-success",
                        conversation_id=conversation.id,
                        user_id=user.id,
                        provider_name="demo",
                        model_name="demo-model",
                        outcome="success",
                        pack_duration_ms=1200,
                        ttft_ms=800,
                        total_duration_ms=5000,
                        upstream_called=True,
                        attachment_count=2,
                        attachment_total_bytes=8_000_000,
                        client_events_json=[{"event": "chat.send.clicked", "detail": ""}],
                        started_at=now - timedelta(hours=1),
                        completed_at=now - timedelta(hours=1),
                    ),
                    ChatTurnTelemetry(
                        correlation_id="cid-interrupted",
                        conversation_id=conversation.id,
                        user_id=user.id,
                        provider_name="demo",
                        model_name="demo-model",
                        outcome="interrupted",
                        pack_duration_ms=2400,
                        total_duration_ms=2500,
                        upstream_called=False,
                        attachment_count=1,
                        attachment_total_bytes=8_963_305,
                        client_events_json=[
                            {"event": "chat.stream.client_error", "detail": "network error"},
                            {"event": "chat.conversation.switch", "detail": "from=92 to=95"},
                        ],
                        started_at=now - timedelta(minutes=30),
                        completed_at=now - timedelta(minutes=30),
                    ),
                ]
            )
            db.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_overview_aggregates_outcomes_and_client_events(self) -> None:
        with self.SessionLocal() as db:
            overview = get_chat_experience_overview(db, days=30)

        self.assertEqual(overview["turn_count"], 2)
        self.assertEqual(overview["outcome_totals"]["success"], 1)
        self.assertEqual(overview["outcome_totals"]["interrupted"], 1)
        self.assertEqual(overview["success_rate"], 0.5)
        self.assertEqual(overview["upstream_call_rate"], 0.5)
        self.assertEqual(overview["attachment_turn_count"], 2)
        self.assertEqual(overview["p95_pack_duration_ms"], 2400)
        self.assertIn("chat.send.clicked", overview["client_event_totals"])
        self.assertIn("chat.stream.client_error", overview["client_event_totals"])

    def test_list_turns_returns_user_and_metrics(self) -> None:
        with self.SessionLocal() as db:
            payload = list_chat_turns(db, days=30, limit=10, offset=0)

        self.assertEqual(payload["total"], 2)
        self.assertEqual(len(payload["items"]), 2)
        self.assertEqual(payload["items"][0]["user_name"], "designer.arch")
        self.assertEqual(payload["items"][0]["client_event_count"], 2)


if __name__ == "__main__":
    unittest.main()
