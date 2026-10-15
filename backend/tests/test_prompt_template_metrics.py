import json
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.database import Base, get_db
from app.routers import prompt_templates


AUTH_USERS_JSON = json.dumps(
    [
        {
            "name": "designer",
            "token": "designer-token",
            "role": "designer",
            "project_codes": ["QMDH-001"],
        },
        {
            "name": "admin",
            "token": "admin-token",
            "role": "admin",
            "project_codes": ["*"],
        },
    ]
)


class PromptTemplateMetricsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(prompt_templates.router)
        self.client = TestClient(self.app)
        self.auth_patcher = patch.object(settings, "auth_users_json", AUTH_USERS_JSON)
        self.auth_patcher.start()

    def tearDown(self) -> None:
        self.auth_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_video_templates_round_trip_and_private_permissions(self) -> None:
        owner = {"X-QMDH-Auth": "designer-token"}
        other = {"X-QMDH-Auth": "admin-token"}
        base = {"label": "Video", "title": "Video prompt", "prompt": "Slow camera pan"}
        created = self.client.post("/prompt-templates", headers=owner, json={**base, "media_type": "video"})
        self.assertEqual(created.status_code, 201, created.text)
        row = created.json()
        self.assertEqual(row["media_type"], "video")
        visible = self.client.get("/prompt-templates", headers=owner).json()
        self.assertEqual(next(t for t in visible if t["id"] == row["id"])["media_type"], "video")
        self.assertNotIn(row["id"], [t["id"] for t in self.client.get("/prompt-templates", headers=other).json()])
        self.assertEqual(self.client.patch(f"/prompt-templates/{row['id']}", headers=other, json={"prompt": "No"}).status_code, 404)
        updated = self.client.patch(f"/prompt-templates/{row['id']}", headers=owner, json={"prompt": "Orbit slowly"})
        self.assertEqual(updated.json()["media_type"], "video")
        legacy = self.client.post("/prompt-templates", headers=owner, json=base)
        self.assertEqual(legacy.json()["media_type"], "image")
        for bad in ("audio", None):
            self.assertEqual(self.client.patch(f"/prompt-templates/{row['id']}", headers=owner, json={"media_type": bad}).status_code, 422)
        shared = self.client.post("/prompt-templates/admin/shared", headers=other, json={**base, "media_type": "video"})
        self.assertEqual(shared.status_code, 201, shared.text)
        self.assertEqual(shared.json()["media_type"], "video")
        self.assertIn(shared.json()["id"], [t["id"] for t in self.client.get("/prompt-templates", headers=owner).json()])
        self.assertEqual(self.client.delete(f"/prompt-templates/{row['id']}", headers=owner).status_code, 204)

    def test_shared_template_popularity_stats_and_deduped_hover(self) -> None:
        created = self.client.post(
            "/prompt-templates/admin/shared",
            headers={"X-QMDH-Auth": "admin-token", "X-QMDH-User": "admin"},
            json={
                "category": "效果渲染",
                "subcategory": "建筑渲染",
                "is_featured": True,
                "label": "建筑分镜",
                "title": "建筑分镜模板",
                "prompt": "生成一张建筑分镜效果图",
                "style": "modern",
                "aspect_ratio": "16:9",
                "resolution": "4k",
                "deliverable": "汇报图",
                "notes": "",
                "source_image_path": "",
                "preview_image_path": "",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        template_id = created.json()["id"]

        first_hover = self.client.post(
            f"/prompt-templates/{template_id}/events",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer"},
            json={"event_type": "hover_preview", "context": "studio"},
        )
        second_hover = self.client.post(
            f"/prompt-templates/{template_id}/events",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer"},
            json={"event_type": "hover_preview", "context": "studio"},
        )
        apply_event = self.client.post(
            f"/prompt-templates/{template_id}/events",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer"},
            json={"event_type": "apply", "context": "studio"},
        )
        submit_event = self.client.post(
            f"/prompt-templates/{template_id}/events",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer"},
            json={"event_type": "submit_success", "context": "studio"},
        )

        self.assertEqual(first_hover.status_code, 201, first_hover.text)
        self.assertTrue(first_hover.json()["recorded"])
        self.assertEqual(second_hover.status_code, 201, second_hover.text)
        self.assertFalse(second_hover.json()["recorded"])
        self.assertTrue(apply_event.json()["recorded"])
        self.assertTrue(submit_event.json()["recorded"])

        listing = self.client.get(
            "/prompt-templates",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer"},
        )
        self.assertEqual(listing.status_code, 200, listing.text)
        payload = listing.json()[0]
        self.assertEqual(payload["recent_apply_count"], 1)
        self.assertEqual(payload["recent_submit_success_count"], 1)
        self.assertEqual(payload["popularity_score"], 15.0)

