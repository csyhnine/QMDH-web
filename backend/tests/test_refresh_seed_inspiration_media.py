import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import InspirationPost
from app.services.inspiration_refresh import (
    build_seed_inspiration_bundle,
    import_seed_inspiration_bundle,
    refresh_seed_inspiration_media,
)


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

    def test_refreshes_seed_svg_placeholders_by_source_url(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                InspirationPost(
                    title="任意旧标题",
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
            side_effect=lambda image_url, *, title, source_url, namespace, overwrite: f"{namespace}/{title}.jpg",
        ):
            with patch(
                "app.services.inspiration_refresh._preferred_seed_image_url",
                side_effect=lambda entry: entry.image_url,
            ):
                result = refresh_seed_inspiration_media(self.SessionLocal)

        self.assertEqual(result.matched, 2)
        self.assertEqual(result.refreshed, 1)
        self.assertEqual(result.restored, 1)
        self.assertEqual(result.placeholders, 0)
        self.assertEqual(result.skipped, 1)

        with self.SessionLocal() as db:
            post = db.scalar(
                select(InspirationPost).where(
                    InspirationPost.source_url == "https://www.archdaily.com/1008788/the-spiral-big"
                )
            )
            self.assertIsNotNone(post)
            assert post is not None
            self.assertEqual(post.image_path, "seed/任意旧标题.jpg")

    def test_import_bundle_updates_matching_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_path = Path(tmpdir) / "seed-bundle.zip"
            with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                bundle.writestr("manifest.json", json.dumps({"entries": [
                    {
                        "title": "The Spiral - BIG",
                        "source_url": "https://www.archdaily.com/1008788/the-spiral-big",
                        "image_url": "https://images.adsttc.com/spiral.jpg",
                        "image_path": "inspiration/seed/the-spiral-real.jpg",
                        "placeholder": False,
                    }
                ]}, ensure_ascii=False))
                bundle.writestr("inspiration/seed/the-spiral-real.jpg", b"real-image")

            with self.SessionLocal() as db:
                db.add(
                    InspirationPost(
                        title="The Spiral - BIG",
                        description="seed",
                        image_path="inspiration/seed/the-spiral-placeholder.svg",
                        category="建筑",
                        source_type="external",
                        source_name="archdaily.com",
                        source_url="https://www.archdaily.com/1008788/the-spiral-big",
                    )
                )
                db.commit()

            with tempfile.TemporaryDirectory() as media_dir:
                with patch("app.services.media_storage.settings.media_root", media_dir):
                    result = import_seed_inspiration_bundle(self.SessionLocal, bundle_path=str(bundle_path))
                    self.assertEqual(result.extracted_files, 1)
                    self.assertEqual(result.matched, 1)
                    self.assertEqual(result.updated, 1)
                    self.assertEqual(result.skipped, 0)
                    self.assertTrue((Path(media_dir) / "inspiration/seed/the-spiral-real.jpg").exists())

            with self.SessionLocal() as db:
                post = db.scalar(select(InspirationPost))
                self.assertIsNotNone(post)
                assert post is not None
                self.assertEqual(post.image_path, "inspiration/seed/the-spiral-real.jpg")

    def test_build_bundle_reports_placeholders(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_path = Path(tmpdir) / "seed-bundle.zip"

            def fake_prepare(image_url, *, title, source_url, namespace, overwrite):
                del image_url, source_url, overwrite
                if "Spiral" in title:
                    return f"{namespace}/the-spiral.jpg"
                return f"{namespace}/placeholder.svg"

            with tempfile.TemporaryDirectory() as media_dir:
                media_root = Path(media_dir)
                (media_root / "seed/the-spiral.jpg").parent.mkdir(parents=True, exist_ok=True)
                (media_root / "seed/the-spiral.jpg").write_bytes(b"jpg")
                (media_root / "seed/placeholder.svg").write_text("<svg/>", encoding="utf-8")

                with patch("app.services.media_storage.settings.media_root", media_dir):
                    with patch("app.services.inspiration_refresh.prepare_inspiration_image", side_effect=fake_prepare):
                        with patch(
                            "app.services.inspiration_refresh._preferred_seed_image_url",
                            side_effect=lambda entry: entry.image_url,
                        ):
                            result = build_seed_inspiration_bundle(str(bundle_path))

            self.assertEqual(result.total, 14)
            self.assertEqual(result.restored, 1)
            self.assertEqual(result.placeholders, 13)
            self.assertTrue(bundle_path.exists())


if __name__ == "__main__":
    unittest.main()
