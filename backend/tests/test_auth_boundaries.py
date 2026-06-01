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
from app.models import DataClassification, Project, Task, Workflow
from app.routers import projects, prompt_templates, tasks


AUTH_USERS_JSON = json.dumps(
    [
        {
            "name": "reviewer",
            "token": "reviewer-token",
            "role": "reviewer",
            "project_codes": ["QMDH-001"],
        },
        {
            "name": "sec.designer",
            "token": "sec-token",
            "role": "designer",
            "project_codes": ["QMDH-SEC"],
        },
        {
            "name": "admin.ops",
            "token": "admin-token",
            "role": "admin",
            "project_codes": ["*"],
        },
    ]
)


class AuthBoundaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            db.add(Project(name="QMDH 示例项目", code="QMDH-001", classification=DataClassification.b))
            db.add(Project(name="涉密改造项目", code="QMDH-SEC", classification=DataClassification.a))
            db.add(
                Workflow(
                    key="image-generate",
                    name="图像生成",
                    description="测试图像生成工作流",
                    category="image",
                    priority="P1",
                    provider_capability="image.generate",
                    config={},
                )
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(projects.router)
        self.app.include_router(prompt_templates.router)
        self.app.include_router(tasks.router)
        self.client = TestClient(self.app)
        self.auth_patcher = patch.object(settings, "auth_users_json", AUTH_USERS_JSON)
        self.auth_patcher.start()
        self.execution_patcher = patch("app.routers.tasks.execute_task")
        self.execution_patcher.start()

    def tearDown(self) -> None:
        self.auth_patcher.stop()
        self.execution_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_prompt_template_owner_comes_from_auth_token(self) -> None:
        response = self.client.post(
            "/prompt-templates",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
            json={
                "user_name": "attacker",
                "label": "测试模板",
                "title": "测试标题",
                "prompt": "生成一张建筑效果图",
                "style": "modern",
                "aspect_ratio": "16:9",
                "resolution": "2k",
                "deliverable": "效果图",
                "notes": "",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user_name"], "reviewer")

        reviewer_templates = self.client.get(
            "/prompt-templates",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
        )
        sec_templates = self.client.get(
            "/prompt-templates",
            headers={"X-QMDH-Auth": "sec-token", "X-QMDH-User": "sec.designer"},
        )

        self.assertEqual(len(reviewer_templates.json()), 1)
        self.assertEqual(sec_templates.json(), [])

    def test_shared_prompt_template_is_visible_to_all_but_admin_managed(self) -> None:
        created = self.client.post(
            "/prompt-templates/admin/shared",
            headers={"X-QMDH-Auth": "admin-token", "X-QMDH-User": "admin.ops"},
            json={
                "label": "公共模板",
                "title": "公共模板标题",
                "prompt": "生成一张城市更新效果图",
                "style": "modern",
                "aspect_ratio": "16:9",
                "resolution": "4k",
                "deliverable": "汇报图",
                "notes": "全员可见",
            },
        )

        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["scope"], "shared")
        self.assertTrue(created.json()["can_manage"])

        reviewer_templates = self.client.get(
            "/prompt-templates",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
        )
        self.assertEqual(reviewer_templates.status_code, 200)
        self.assertEqual(len(reviewer_templates.json()), 1)
        self.assertEqual(reviewer_templates.json()[0]["scope"], "shared")
        self.assertFalse(reviewer_templates.json()[0]["can_manage"])

        forbidden_update = self.client.patch(
            f"/prompt-templates/{created.json()['id']}",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
            json={"label": "attacker"},
        )
        self.assertEqual(forbidden_update.status_code, 404)

    def test_non_admin_cannot_manage_shared_prompt_templates(self) -> None:
        response = self.client.post(
            "/prompt-templates/admin/shared",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
            json={
                "label": "公共模板",
                "title": "公共模板标题",
                "prompt": "生成一张城市更新效果图",
                "style": "modern",
                "aspect_ratio": "16:9",
                "resolution": "4k",
                "deliverable": "汇报图",
                "notes": "全员可见",
            },
        )

        self.assertEqual(response.status_code, 403)

    def test_project_list_is_filtered_by_authenticated_user(self) -> None:
        response = self.client.get(
            "/projects",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([project["code"] for project in response.json()], ["QMDH-001"])

        forbidden = self.client.get(
            "/projects/QMDH-SEC/status",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_token_only_user_cannot_create_personal_project(self) -> None:
        response = self.client.post(
            "/projects",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
            json={
                "name": "Reviewer personal group",
                "classification": "B",
            },
        )

        self.assertEqual(response.status_code, 403)

    def test_mismatched_user_header_is_rejected(self) -> None:
        response = self.client.get(
            "/prompt-templates",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "attacker"},
        )

        self.assertEqual(response.status_code, 403)

    def test_task_actor_and_project_access_come_from_auth_token(self) -> None:
        response = self.client.post(
            "/tasks",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
            json={
                "title": "测试图像生成任务",
                "workflow_key": "image-generate",
                "project_code": "QMDH-001",
                "user_name": "attacker",
                "requested_provider": "jimeng",
                "classification": "B",
                "payload": {
                    "prompt": "生成一张建筑效果图",
                    "image_count": 2,
                    "reference_image": "/media/reference/cover.png",
                    "source_image": "/media/reference/cover.png",
                },
            },
        )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["user_name"], "reviewer")
        self.assertTrue(response.json()["result"]["reference_image_supplied"])
        self.assertEqual(response.json()["result"]["reference_image_count"], 1)
        self.assertEqual(response.json()["result"]["reference_image_storage_path"], "/media/reference/cover.png")
        self.assertEqual(response.json()["result"]["reference_image_storage_paths"], ["/media/reference/cover.png"])
        self.assertEqual(response.json()["result"]["requested_image_count"], 2)

        with self.SessionLocal() as db:
            created_task = db.query(Task).filter(Task.title == "测试图像生成任务").one()

        self.assertEqual(created_task.payload["reference_image"], "/media/reference/cover.png")
        self.assertEqual(created_task.payload["source_image"], "/media/reference/cover.png")

        forbidden = self.client.post(
            "/tasks",
            headers={"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"},
            json={
                "title": "测试涉密项目任务",
                "workflow_key": "image-generate",
                "project_code": "QMDH-SEC",
                "requested_provider": "jimeng",
                "classification": "B",
                "payload": {"prompt": "生成一张建筑效果图"},
            },
        )
        self.assertEqual(forbidden.status_code, 403)


if __name__ == "__main__":
    unittest.main()
