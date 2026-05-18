import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import InspirationPost
from app.services.inspiration_refresh import refresh_seed_inspiration_media


class RefreshSeedInspirationMediaTests(unittest.TestCase):
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

    def test_refreshes_only_seed_svg_placeholders_by_default(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                InspirationPost(
                    title="The Spiral - BIG",
                    description="seed",
                    image_path="inspiration/seed/spiral-placeholder.svg",
                    category="建筑",
                    source_type="external",
                    source_name="archdaily.com",
                    source_url="https://www.archdaily.com/1008788/the-spiral-big",
                )
            )
            db.add(
                InspirationPost(
                    title="Aman New York - Jean-Michel Gathy",
                    description="seed",
                    image_path="inspiration/seed/aman.jpg",
                    category="室内",
                    source_type="external",
                    source_name="archdaily.com",
                    source_url="https://www.archdaily.com/989917/aman-new-york-jean-michel-gathy",
                )
            )
            db.commit()

        with patch(
            "app.services.inspiration_refresh.prepare_inspiration_image",
            side_effect=lambda image_url, *, title, source_url, namespace: f"{namespace}/{title}.jpg",
        ):
            result = refresh_seed_inspiration_media(self.SessionLocal)

        self.assertEqual(result.matched, 2)
        self.assertEqual(result.refreshed, 1)
        self.assertEqual(result.skipped, 1)

        with self.SessionLocal() as db:
            posts = {
                post.title: post.image_path
                for post in db.scalars(select(InspirationPost)).all()
            }
            self.assertEqual(posts["The Spiral - BIG"], "seed/The Spiral - BIG.jpg")
            self.assertEqual(posts["Aman New York - Jean-Michel Gathy"], "inspiration/seed/aman.jpg")


if __name__ == "__main__":
    unittest.main()
