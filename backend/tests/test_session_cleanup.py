import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AuthSession, User
from app.services.session_cleanup import cleanup_sessions


class SessionCleanupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        self.now = datetime.now(timezone.utc)

        with self.SessionLocal() as db:
            user = User(
                name="cleanup-user",
                display_name="Cleanup User",
                role="admin",
                password_hash="not-used",
                is_active=True,
                project_codes=["*"],
            )
            db.add(user)
            db.flush()
            db.add_all(
                [
                    AuthSession(
                        user_id=user.id,
                        token_hash="expired-active",
                        expires_at=self.now - timedelta(hours=1),
                        revoked_at=None,
                    ),
                    AuthSession(
                        user_id=user.id,
                        token_hash="active",
                        expires_at=self.now + timedelta(days=1),
                        revoked_at=None,
                    ),
                    AuthSession(
                        user_id=user.id,
                        token_hash="revoked-stale",
                        expires_at=self.now + timedelta(days=1),
                        revoked_at=self.now - timedelta(days=31),
                    ),
                    AuthSession(
                        user_id=user.id,
                        token_hash="revoked-recent",
                        expires_at=self.now + timedelta(days=1),
                        revoked_at=self.now - timedelta(days=5),
                    ),
                ]
            )
            db.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_cleanup_deletes_only_expired_unrevoked_sessions(self) -> None:
        with self.SessionLocal() as db:
            result = cleanup_sessions(db, now=self.now)
            remaining = {row.token_hash for row in db.scalars(select(AuthSession)).all()}

        self.assertEqual(result.expired_deleted, 1)
        self.assertEqual(result.revoked_deleted, 1)
        self.assertEqual(result.failed_batches, ())
        self.assertNotIn("expired-active", remaining)
        self.assertIn("active", remaining)

    def test_cleanup_purges_only_revoked_sessions_older_than_thirty_days(self) -> None:
        with self.SessionLocal() as db:
            cleanup_sessions(db, now=self.now)
            remaining = {row.token_hash for row in db.scalars(select(AuthSession)).all()}

        self.assertNotIn("revoked-stale", remaining)
        self.assertIn("revoked-recent", remaining)


if __name__ == "__main__":
    unittest.main()
