import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.integrations.mcp.server import run_mcp_tool
from app.models import AuditLog
from app.services.bootstrap import seed_initial_data


class McpAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_run_mcp_tool_writes_audit_log(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            payload = run_mcp_tool(db, "summarize_generation_stack", {})
            db.commit()
            logs = db.scalars(select(AuditLog).where(AuditLog.event_type == "mcp.tool_call")).all()

        self.assertIsInstance(payload, dict)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].actor_name, "mcp-client")
        self.assertEqual(logs[0].target_name, "summarize_generation_stack")
        self.assertIn("result_preview", logs[0].details)


if __name__ == "__main__":
    unittest.main()
