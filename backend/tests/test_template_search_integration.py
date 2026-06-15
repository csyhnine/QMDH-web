import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.integrations.search.service import search_domain
from app.models import PromptTemplate, User
from app.services.bootstrap import seed_initial_data


class TemplateSearchIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_search_templates_falls_back_to_postgres(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            from sqlalchemy import select

            user = db.scalar(select(User).limit(1))
            self.assertIsNotNone(user)
            db.add(
                PromptTemplate(
                    scope="shared",
                    title="夜景商业综合体",
                    prompt="night city commercial complex, cinematic lighting",
                    category="建筑",
                    subcategory="商业",
                    label="夜景商业综合体",
                    user_id=user.id,
                )
            )
            db.commit()

            hits = search_domain(db, domain="templates", query="夜景商业", limit=10)
            self.assertTrue(hits)
            self.assertEqual(hits[0].title, "夜景商业综合体")
            self.assertEqual(hits[0].domain, "templates")


if __name__ == "__main__":
    unittest.main()
