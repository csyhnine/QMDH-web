from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import select

from app.models import Asset, AssetBookmark, AssetType, DataClassification, Project, Task, TaskStatus, User, Workflow
from tests.test_database_auth import DatabaseAuthTests


class StudioPerfListLimitsTests(DatabaseAuthTests):
    def test_cursor_is_stable_with_new_and_deleted_tasks(self) -> None:
        token = self.login("designer", "designer-pass")
        headers = {"Authorization": f"Bearer {token}"}
        first = self.client.get("/tasks?limit=1", headers=headers).json()
        cursor = first[0]["id"]
        with self.SessionLocal() as db:
            anchor = db.get(Task, cursor)
            assert anchor
            db.add(Task(title="New task", status=TaskStatus.completed,
                        workflow_id=anchor.workflow_id, project_id=anchor.project_id,
                        user_id=anchor.user_id, requested_provider=anchor.requested_provider,
                        classification=DataClassification.b, payload={}, result={}))
            anchor.deleted_at = datetime.now(timezone.utc)
            db.commit()
        next_page = self.client.get(f"/tasks?limit=1&before_id={cursor}", headers=headers)
        self.assertEqual(next_page.status_code, 200, next_page.text)
        self.assertEqual(len(next_page.json()), 1)
        self.assertLess(next_page.json()[0]["id"], cursor)
        self.assertEqual(self.client.get("/tasks?before_id=0", headers=headers).status_code, 422)

    def test_asset_limit_and_bookmark_filter_apply_after_access(self) -> None:
        token = self.login("designer", "designer-pass")
        headers = {"Authorization": f"Bearer {token}"}
        own = self.client.get("/assets", headers=headers).json()[0]
        with self.SessionLocal() as db:
            peer = db.scalar(select(User).where(User.name == "peer.designer"))
            anchor = db.get(Task, own["source_task_id"])
            assert peer and anchor
            peer_task = Task(title="Peer task", status=TaskStatus.completed,
                             workflow_id=anchor.workflow_id, project_id=anchor.project_id,
                             user_id=peer.id, requested_provider=anchor.requested_provider,
                             classification=DataClassification.b, payload={}, result={})
            db.add(peer_task)
            db.flush()
            db.add(Asset(name="Newer private asset", asset_type=AssetType.image,
                         project_id=anchor.project_id, source_task_id=peer_task.id,
                         storage_path="media/peer.png", tags=[]))
            db.add(AssetBookmark(user_id=anchor.user_id, asset_id=own["id"]))
            db.commit()
            peer_id = peer_task.id
        limited = self.client.get("/assets?limit=1&bookmarked=true", headers=headers)
        self.assertEqual(limited.status_code, 200, limited.text)
        self.assertEqual([asset["id"] for asset in limited.json()], [own["id"]])
        self.assertEqual(self.client.get(f"/assets?task_ids={peer_id}", headers=headers).json(), [])
        self.assertEqual(self.client.get(f"/tasks?task_ids={peer_id}", headers=headers).json(), [])

    def test_older_active_task_can_be_followed_to_completion(self) -> None:
        token = self.login("designer", "designer-pass")
        headers = {"Authorization": f"Bearer {token}"}
        with self.SessionLocal() as db:
            anchor = db.scalar(select(Task).join(Task.user).where(User.name == "designer"))
            assert anchor
            anchor.status = TaskStatus.running
            anchor_id = anchor.id
            for index in range(45):
                db.add(Task(title=f"Newer {index}", status=TaskStatus.completed,
                            workflow_id=anchor.workflow_id, project_id=anchor.project_id,
                            user_id=anchor.user_id, requested_provider=anchor.requested_provider,
                            classification=DataClassification.b, payload={}, result={}))
            db.commit()
        recent = self.client.get("/tasks?limit=40", headers=headers).json()
        self.assertNotIn(anchor_id, [task["id"] for task in recent])
        active = self.client.get("/tasks?status=running&status=pending", headers=headers).json()
        self.assertIn(anchor_id, [task["id"] for task in active])
        with self.SessionLocal() as db:
            db.get(Task, anchor_id).status = TaskStatus.completed
            db.commit()
        terminal = self.client.get(f"/tasks?task_ids={anchor_id}", headers=headers).json()
        self.assertEqual(terminal[0]["status"], "completed")

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
