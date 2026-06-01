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

