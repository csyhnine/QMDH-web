from __future__ import annotations

import unittest

from sqlalchemy import select

from app.models import DataClassification, Project, Task, TaskStatus, User, Workflow
from tests.test_database_auth import DatabaseAuthTests


class StudioPerfListLimitsTests(DatabaseAuthTests):
    def test_list_tasks_supports_limit_and_status_filters(self) -> None:
        designer_token = self.login("designer", "designer-pass")

        with self.SessionLocal() as db:
            user = db.scalar(select(User).where(User.name == "designer"))
            project = db.scalar(select(Project).where(Project.code == "QMDH-001"))
            workflow = db.scalar(select(Workflow).where(Workflow.key == "image-generate"))
            assert user and project and workflow

            for index, status in enumerate(
                [TaskStatus.completed, TaskStatus.failed, TaskStatus.pending, TaskStatus.running]
            ):
                db.add(
                    Task(
                        title=f"Limit probe {index}",
                        status=status,
                        workflow_id=workflow.id,
                        project_id=project.id,
                        user_id=user.id,
                        requested_provider="modelscope_free_image",
                        classification=DataClassification.b,
                        payload={"prompt": "probe"},
                        result={"summary": "probe"},
                    )
                )
            db.commit()

        limited = self.client.get("/tasks?limit=2", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(limited.status_code, 200, limited.text)
        self.assertEqual(len(limited.json()), 2)

        active = self.client.get(
            "/tasks?status=pending&status=running",
            headers={"Authorization": f"Bearer {designer_token}"},
        )
        self.assertEqual(active.status_code, 200, active.text)
        self.assertEqual({task["status"] for task in active.json()}, {"pending", "running"})

    def test_list_assets_supports_limit(self) -> None:
        designer_token = self.login("designer", "designer-pass")

        limited = self.client.get("/assets?limit=1", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(limited.status_code, 200, limited.text)
        self.assertEqual(len(limited.json()), 1)


if __name__ == "__main__":
    unittest.main()
