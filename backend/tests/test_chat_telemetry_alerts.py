import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import ChatTelemetryAlert, ChatTurnTelemetry, Conversation, User
from app.services.chat_telemetry_alert_service import (
    compute_chat_window_metrics,
    evaluate_chat_telemetry_alerts,
    list_chat_telemetry_alerts,
)


class ChatTelemetryAlertTests(unittest.TestCase):
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

            turns = []
            for index in range(8):
                turns.append(
                    ChatTurnTelemetry(
                        correlation_id=f"cid-upstream-{index}",
                        conversation_id=conversation.id,
                        user_id=user.id,
                        provider_name="demo",
                        model_name="demo-model",
                        outcome="success",
                        pack_duration_ms=1000,
                        total_duration_ms=3000,
                        upstream_called=True,
                        started_at=now - timedelta(minutes=index + 1),
                        completed_at=now - timedelta(minutes=index + 1),
                    )
                )
            for index in range(2):
                turns.append(
                    ChatTurnTelemetry(
                        correlation_id=f"cid-interrupted-{index}",
                        conversation_id=conversation.id,
                        user_id=user.id,
                        provider_name="demo",
                        model_name="demo-model",
                        outcome="interrupted",
                        pack_duration_ms=5000,
                        total_duration_ms=5100,
                        upstream_called=False,
                        started_at=now - timedelta(minutes=index + 1),
                        completed_at=now - timedelta(minutes=index + 1),
                    )
                )
            db.add_all(turns)
            db.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_compute_window_metrics_counts_upstream_and_interrupted(self) -> None:
        with self.SessionLocal() as db:
            metrics = compute_chat_window_metrics(db, window_hours=1)

        self.assertEqual(metrics["turn_count"], 10)
        self.assertEqual(metrics["upstream_call_rate"], 0.8)
        self.assertEqual(metrics["interrupted_rate"], 0.2)

    def test_evaluate_opens_upstream_alert_and_resolves_when_recovered(self) -> None:
        with self.SessionLocal() as db:
            first = evaluate_chat_telemetry_alerts(db)
            self.assertIn("upstream_call_rate_low", first["triggered_keys"])
            alert = db.scalar(
                select(ChatTelemetryAlert).where(ChatTelemetryAlert.alert_key == "upstream_call_rate_low")
            )
            assert alert is not None
            self.assertEqual(alert.status, "open")
            self.assertEqual(alert.occurrence_count, 1)

            for turn in db.scalars(select(ChatTurnTelemetry).where(ChatTurnTelemetry.outcome == "interrupted")).all():
                turn.outcome = "success"
                turn.upstream_called = True
                db.add(turn)
            db.commit()

            second = evaluate_chat_telemetry_alerts(db)
            self.assertNotIn("upstream_call_rate_low", second["triggered_keys"])
            db.refresh(alert)
            self.assertEqual(alert.status, "resolved")
            self.assertIsNotNone(alert.resolved_at)

    def test_list_open_alerts(self) -> None:
        with self.SessionLocal() as db:
            evaluate_chat_telemetry_alerts(db)
            open_alerts = list_chat_telemetry_alerts(db, status="open", limit=10)

        self.assertGreaterEqual(len(open_alerts), 1)
        self.assertEqual(open_alerts[0]["status"], "open")


if __name__ == "__main__":
    unittest.main()
