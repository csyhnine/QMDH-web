import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import User
from seed_users import seed_staff_users


class SeedUsersTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_seed_staff_users_is_idempotent(self) -> None:
        first = seed_staff_users(self.SessionLocal, engine_to_init=self.engine, stdout=None)
        self.assertGreater(first.created, 0)

        second = seed_staff_users(self.SessionLocal, engine_to_init=self.engine, stdout=None)
        self.assertEqual(second.created, 0)
        self.assertGreater(second.skipped, 0)

        with self.SessionLocal() as db:
            users = db.scalars(select(User)).all()
            self.assertGreaterEqual(len(users), first.created)
            self.assertTrue(any(user.role == "admin" for user in users))
            self.assertTrue(any(user.role == "ops" for user in users))
            self.assertTrue(any(user.role == "designer" for user in users))
            self.assertTrue(all(user.is_active for user in users))


if __name__ == "__main__":
    unittest.main()
