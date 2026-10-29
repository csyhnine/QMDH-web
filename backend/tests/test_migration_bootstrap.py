"""Exercise the real Alembic chain without application startup/schema repair."""
from pathlib import Path
from datetime import datetime, timezone
import importlib.util
import os
from unittest.mock import patch
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
import pytest
import sqlalchemy as sa

from app.core.config import settings
from app.database import Base


FOLDER = Path(__file__).parents[1] / "migrations"


@pytest.fixture(params=["sqlite", "postgresql"])
def migration_database(request, tmp_path, monkeypatch):
    schema = None
    admin = None
    if request.param == "sqlite":
        url = "sqlite:///" + (tmp_path / "empty.db").as_posix()
    else:
        # Explicit test-only opt-in; never fall back to application .env/URL.
        url = os.environ.get("TEST_MIGRATION_POSTGRES_URL")
        if not url:
            pytest.skip("TEST_MIGRATION_POSTGRES_URL not set; PostgreSQL not verified")
        admin = sa.create_engine(url)
        schema = "qmdh_migration_test_" + uuid4().hex
        with admin.begin() as connection:
            connection.execute(sa.schema.CreateSchema(schema))
        url = sa.engine.make_url(url).update_query_dict({"options": "-csearch_path=" + schema}).render_as_string(hide_password=False)
    monkeypatch.setattr(settings, "database_url", url)
    config = Config()
    config.set_main_option("script_location", str(FOLDER))
    engine = sa.create_engine(url)
    try:
        with patch.object(Base.metadata, "create_all", side_effect=AssertionError("no create_all")):
            yield config, engine
    finally:
        engine.dispose()
        if admin is not None:
            try:
                # Only remove the unique schema created by this fixture.
                with admin.begin() as connection:
                    connection.execute(sa.schema.DropSchema(schema, cascade=True))
            finally:
                admin.dispose()


def load_migration(filename):
    spec = importlib.util.spec_from_file_location("bootstrap_migration", FOLDER / "versions" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def insert_row(connection, table_name, **values):
    table = sa.Table(table_name, sa.MetaData(), autoload_with=connection)
    connection.execute(table.insert().values(**values))


def insert_user(connection):
    values = dict(id=1, name="migration-test", display_name="test", group_name="",
                  role="designer", password_hash="test-only", is_active=True, project_codes=[],
                  billing_plan="standard", billing_status="active", quota_policy="soft_warn",
                  quota_reset_cycle="monthly")
    columns = {col["name"] for col in sa.inspect(connection).get_columns("users")}
    insert_row(connection, "users", **{key: value for key, value in values.items() if key in columns})


def assert_head_and_model_columns(config, engine):
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_heads() == tuple(
            ScriptDirectory.from_config(config).get_heads()
        )
        inspector = sa.inspect(connection)
        actual_tables = set(inspector.get_table_names())
        missing = {}
        for name, table in Base.metadata.tables.items():
            actual = {col["name"] for col in inspector.get_columns(name)} if name in actual_tables else set()
            absent = set(table.columns.keys()) - actual
            if absent:
                missing[name] = sorted(absent)
        assert not missing, missing


def test_migration_bootstrap_empty_database_reaches_head(migration_database):
    config, engine = migration_database
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    assert_head_and_model_columns(config, engine)
    with engine.connect() as connection:
        fks = sa.inspect(connection).get_foreign_keys("agent_memory_entries")
        assert any(fk["constrained_columns"] == ["conversation_id"]
                   and fk["options"].get("ondelete") == "SET NULL" for fk in fks)
        for name in Base.metadata.tables:
            # Existing settings migration intentionally seeds its singleton.
            expected = 1 if name == "platform_settings" else 0
            assert connection.execute(sa.text(f'SELECT count(*) FROM "{name}"')).scalar_one() == expected


def test_migration_bootstrap_preserves_legacy_chat_and_billing(migration_database):
    config, engine = migration_database
    command.upgrade(config, "cd888e40cb37")
    chat = load_migration("d2348a1e3427_add_conversations_and_chat_messages_.py")
    with engine.begin() as connection:
        insert_user(connection)
        insert_row(connection, "provider_profiles", id=1, provider_name="keep-provider", api_key="test-only",
                   base_url="http://unused.invalid", model_name="keep-model", adapter_kind="mock",
                   capabilities=[], quality="test", output_format="png", timeout_seconds=10,
                   pricing_currency="CNY", pricing_unit="image", unit_price=0.1, enabled=False,
                   reference_mode="none")
        insert_row(connection, "projects", id=1, name="test", code="test", classification="b")
        insert_row(connection, "workflows", id=1, key="test", name="test", description="",
                   category="test", priority="P1", version="v1", provider_capability="test", config={})
        insert_row(connection, "tasks", id=1, title="test", status="completed", workflow_id=1,
                   project_id=1, user_id=1, requested_provider="test", payload={}, result={},
                   classification="b", cost=2.5, cost_currency="CNY", latency_ms=100)
        with Operations.context(MigrationContext.configure(connection)):
            chat.upgrade()
        insert_row(connection, "conversations", id=1, user_id=1, title="keep title")
        insert_row(connection, "chat_messages", id=1, conversation_id=1, role="user",
                   content="keep content", token_count=7)
        connection.execute(sa.text("ALTER TABLE chat_messages ADD COLUMN legacy_marker VARCHAR(30)"))
        connection.execute(sa.text("UPDATE chat_messages SET legacy_marker='keep marker'"))
    # The old revision was a no-op: tables may already exist while the database
    # is still stamped before it. Execute the real chain across that boundary.
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    assert_head_and_model_columns(config, engine)
    with engine.connect() as connection:
        assert connection.execute(sa.text("SELECT content, token_count, legacy_marker FROM chat_messages")).one() == ("keep content", 7, "keep marker")
        assert connection.execute(sa.text("SELECT title FROM conversations")).scalar_one() == "keep title"
        assert connection.execute(sa.text("SELECT cost FROM tasks")).scalar_one() == 2.5
        assert connection.execute(sa.text("SELECT cost, prompt_tokens, input_tokens FROM usage_ledgers")).one() == (2.5, 0, 0)
        assert connection.execute(sa.text("SELECT display_name, api_key, api_secret FROM provider_profiles")).one() == ("keep-model", "test-only", "")
        assert connection.execute(sa.text("SELECT owner_user_id FROM projects")).scalar_one() is None
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        with pytest.raises(RuntimeError, match="preserve"):
            chat.downgrade()
        assert connection.execute(sa.text("SELECT count(*) FROM chat_messages")).scalar_one() == 1


def test_migration_bootstrap_preserves_existing_owner_and_canvas(migration_database):
    config, engine = migration_database
    command.upgrade(config, "b27d0f85c932")
    with engine.begin() as connection:
        # Reproduce the historical application bootstrap, not a prerequisite
        # for the empty database test above. Keep an unknown extension column.
        from app.models import CanvasProject
        CanvasProject.__table__.create(connection)
        connection.execute(sa.text("ALTER TABLE projects ADD COLUMN owner_user_id INTEGER"))
        connection.execute(sa.text("ALTER TABLE canvas_projects ADD COLUMN legacy_marker VARCHAR(30)"))
        insert_user(connection)
        insert_row(connection, "projects", id=1, name="test", code="test", classification="b", owner_user_id=1)
        insert_row(connection, "canvas_projects", id=1, owner_user_id=1, title="keep canvas",
                   graph_json={"nodes": [{"id": "keep-node"}]}, legacy_marker="keep marker")
    command.upgrade(config, "head")
    completion = load_migration("c39d8e71a624_complete_bootstrap_schema.py")
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        completion.upgrade()
        assert connection.execute(sa.text("SELECT owner_user_id FROM projects")).scalar_one() == 1
        table = sa.Table("canvas_projects", sa.MetaData(), autoload_with=connection)
        row = connection.execute(sa.select(table)).mappings().one()
        assert row["title"] == "keep canvas"
        assert row["graph_json"] == {"nodes": [{"id": "keep-node"}]}
        assert row["legacy_marker"] == "keep marker"
        with pytest.raises(RuntimeError, match="preserve"):
            completion.downgrade()
        assert connection.execute(sa.select(sa.func.count()).select_from(table)).scalar_one() == 1
    assert_head_and_model_columns(config, engine)


def test_migration_bootstrap_memory_foreign_key_keeps_history(migration_database):
    config, engine = migration_database
    command.upgrade(config, "o6p7q8r9s0t1")
    with engine.begin() as connection:
        insert_user(connection)
        insert_row(connection, "conversations", id=1, user_id=1, title="test")
        insert_row(connection, "agent_memory_entries", id=1, user_id=1,
                   conversation_id=1, content="keep memory", created_at=datetime.now(timezone.utc))
    command.upgrade(config, "head")
    with engine.connect() as connection:
        if connection.dialect.name == "sqlite":
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
        with connection.begin():
            connection.execute(sa.text("DELETE FROM conversations WHERE id=1"))
            assert connection.execute(sa.text("SELECT conversation_id, content FROM agent_memory_entries")).one() == (None, "keep memory")
    assert_head_and_model_columns(config, engine)
