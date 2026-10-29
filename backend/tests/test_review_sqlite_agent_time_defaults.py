"""R32: real Alembic SQLite databases and normal writes, with no startup repair."""
from copy import deepcopy
from datetime import datetime
import importlib.util
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models import AgentMemoryEntry, AgentPolicyOverride, AgentSkillCatalogEntry, AgentSkillRelease, Conversation, User
from app.services.agent_memory_service import add_memory_entry
from app.services import agent_skill_registry


OLD = "c39d8e71a624"
NEW = "d40e9f82b735"
FOLDER = Path(__file__).resolve().parents[1] / "migrations"
FILE = FOLDER / "versions/d40e9f82b735_fix_sqlite_agent_time_defaults.py"
FIXED = datetime(2024, 1, 2, 3, 4, 5)
TARGETS = {"agent_policy_overrides": ("created_at", "updated_at"), "agent_memory_entries": ("created_at",),
           "agent_skill_catalog": ("created_at", "updated_at")}


def migration_module():
    spec = importlib.util.spec_from_file_location("r32_migration", FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SQLiteAgentTimeDefaultsTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r32-offline-")))
        self.url = "sqlite:///" + (self.root / "migration.db").as_posix()
        self.engine = sa.create_engine(self.url)
        self.addCleanup(self.engine.dispose)
        sa.event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        self.sessions = sessionmaker(self.engine)
        self.config = Config()
        self.config.set_main_option("script_location", str(FOLDER))
        self.user_id = None

    def upgrade(self, revision=NEW):
        with patch.object(settings, "database_url", self.url), patch.object(sa, "engine_from_config", return_value=self.engine), \
                patch.object(sa.MetaData, "create_all", side_effect=AssertionError("real migration cannot call create_all")):
            command.upgrade(self.config, revision)

    def parents(self):
        with self.sessions() as db:
            user = User(name="r32-synthetic", role="designer", password_hash="unused", is_active=True, project_codes=[])
            db.add(user)
            db.flush()
            conversation = Conversation(user_id=user.id, title="synthetic history")
            db.add(conversation)
            db.commit()
            self.user_id, self.conversation_id = user.id, conversation.id

    def write(self, kind):
        with self.sessions() as db:
            if kind == "memory":
                with patch("app.integrations.search.agent_memory_index.index_agent_memory_entry", return_value=None):
                    row = add_memory_entry(db, user_id=self.user_id, conversation_id=self.conversation_id,
                                           content="synthetic ordinary memory", memory_type="fact", source_turn_ref="manual:r32")
            elif kind == "policy":
                row = AgentPolicyOverride(scope="user", scope_key=str(self.user_id), created_by_user_id=self.user_id,
                                          disabled_tool_keys=[], system_prompt_overlay="", notes="synthetic", is_active=False)
                db.add(row)
                db.flush()
            else:
                with patch.object(agent_skill_registry, "list_filesystem_skills", return_value=[]):
                    row = agent_skill_registry.create_catalog_skill(db, key="r32-synthetic", name="Synthetic ordinary catalog row",
                                                                   created_by_user_id=self.user_id)
            db.commit()
            self.assertIsInstance(row.created_at, datetime)
            if hasattr(row, "updated_at"):
                self.assertIsInstance(row.updated_at, datetime)
            return row.id

    def seed_legacy(self):
        self.parents()
        with self.sessions() as db:
            db.add_all([
                AgentMemoryEntry(id=11, user_id=self.user_id, conversation_id=self.conversation_id, memory_type="fact", content="保留记忆",
                                 source_turn_ref="manual:legacy", created_at=FIXED),
                AgentPolicyOverride(id=12, scope="group", scope_key="synthetic-legacy", created_by_user_id=self.user_id,
                                    disabled_tool_keys=["synthetic-unused"], notes="保留策略数据", created_at=FIXED, updated_at=FIXED),
                AgentSkillCatalogEntry(id=13, key="r32-legacy", name="保留目录", files_json={"fixture.txt": "keep"},
                                      created_by_user_id=self.user_id, created_at=FIXED, updated_at=FIXED),
            ])
            db.commit()

    def snapshot(self):
        with self.engine.connect() as c:
            schema = [tuple(row) for row in c.exec_driver_sql("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")]
            tables = sa.inspect(c).get_table_names()
            data = {name: [tuple(row) for row in c.exec_driver_sql('SELECT * FROM "' + name.replace('"', '""') + '" ORDER BY rowid')]
                    for name in tables}
            return {"schema": schema, "data": data}

    def head(self):
        with self.engine.connect() as c:
            return MigrationContext.configure(c).get_current_heads()

    def test_real_head_memory_service_insert_uses_database_default_time(self):
        self.upgrade()
        self.parents()
        self.write("memory")

    def test_real_head_policy_orm_insert_uses_database_default_times(self):
        self.upgrade()
        self.parents()
        self.write("policy")

    def test_real_head_catalog_service_insert_uses_database_default_times(self):
        self.upgrade()
        self.parents()
        self.write("catalog")

    def test_populated_old_head_preserves_rows_times_extensions_indexes_checks_and_trigger(self):
        self.upgrade(OLD)
        self.seed_legacy()
        with self.engine.begin() as c:
            for table in TARGETS:
                c.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN legacy_marker TEXT NOT NULL DEFAULT 'keep' CHECK(length(legacy_marker) > 0)")
            c.exec_driver_sql("CREATE INDEX ix_r32_memory_lower ON agent_memory_entries(lower(content))")
            c.exec_driver_sql("CREATE INDEX ix_r32_policy_partial ON agent_policy_overrides(scope) WHERE is_active=1")
            c.exec_driver_sql("CREATE TABLE r32_insert_audit (memory_id INTEGER, marker TEXT)")
            c.exec_driver_sql("CREATE TRIGGER r32_memory_insert AFTER INSERT ON agent_memory_entries BEGIN INSERT INTO r32_insert_audit VALUES (NEW.id, NEW.content); END")
        before = self.snapshot()
        self.upgrade()
        after = self.snapshot()
        self.assertEqual({k: v for k, v in before["data"].items() if k != "alembic_version"},
                         {k: v for k, v in after["data"].items() if k != "alembic_version"})
        before_objects = {name: sql for typ, name, table, sql in before["schema"] if name in {"ix_r32_memory_lower", "r32_memory_insert"}}
        after_objects = {name: sql for typ, name, table, sql in after["schema"] if name in before_objects}
        self.assertEqual(after_objects, before_objects)
        with self.engine.connect() as c:
            inspector = sa.inspect(c)
            partial = next(index for index in inspector.get_indexes("agent_policy_overrides") if index["name"] == "ix_r32_policy_partial")
            self.assertEqual((partial["column_names"], partial["unique"], str(partial["dialect_options"]["sqlite_where"])), (["scope"], 0, "is_active=1"))
            for table, columns in TARGETS.items():
                actual = {col["name"]: col for col in inspector.get_columns(table)}
                self.assertIn("legacy_marker", actual)
                for column in columns:
                    self.assertEqual(actual[column]["default"].strip("()"), "CURRENT_TIMESTAMP")
                self.assertTrue(any("length(legacy_marker)" in check["sqltext"] for check in inspector.get_check_constraints(table)))
            self.assertEqual(c.exec_driver_sql("PRAGMA foreign_key_check").all(), [])
            self.assertEqual(c.exec_driver_sql("PRAGMA foreign_keys").scalar_one(), 1)
            with self.assertRaises(sa.exc.IntegrityError):
                with c.begin_nested():
                    c.exec_driver_sql("UPDATE agent_memory_entries SET legacy_marker='' WHERE id=11")
        self.write("memory")
        with self.engine.connect() as c:
            self.assertEqual(c.exec_driver_sql("SELECT count(*) FROM r32_insert_audit").scalar_one(), 1)

    def test_upgrade_head_is_repeatable_and_has_one_new_head(self):
        self.upgrade(OLD)
        self.seed_legacy()
        self.upgrade("head")
        before = self.snapshot()
        self.upgrade("head")
        self.assertEqual(self.snapshot(), before)
        scripts = ScriptDirectory.from_config(self.config)
        self.assertEqual(len(scripts.get_heads()), 1)
        self.assertEqual(self.head(), tuple(scripts.get_heads()))
        self.assertIn(NEW, [revision.revision for revision in scripts.walk_revisions()])
        self.assertEqual(scripts.get_revision(NEW).down_revision, OLD)

    def test_copy_ddl_and_version_failures_rollback_entire_correction_and_keep_old_head(self):
        self.upgrade(OLD)
        self.seed_legacy()
        before = self.snapshot()
        for point in ("copy", "ddl", "version"):
            def fail(connection, cursor, statement, params, context, executemany):
                sql = statement.strip().upper().replace('"', '')
                hit = (point == "copy" and sql.startswith("INSERT INTO _ALEMBIC_TMP_AGENT_MEMORY_ENTRIES")) or \
                      (point == "ddl" and sql.startswith("ALTER TABLE _ALEMBIC_TMP_AGENT_SKILL_CATALOG RENAME")) or \
                      (point == "version" and sql.startswith("UPDATE ALEMBIC_VERSION") and (NEW in repr(params) or NEW.upper() in sql))
                if hit:
                    raise RuntimeError("synthetic migration " + point + " failure")
            sa.event.listen(self.engine, "before_cursor_execute", fail)
            try:
                with self.subTest(point=point), self.assertRaises(RuntimeError):
                    self.upgrade()
            finally:
                sa.event.remove(self.engine, "before_cursor_execute", fail)
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(self.head(), (OLD,))
        self.upgrade()
        self.write("memory")

    def test_foreign_keys_uniques_and_memory_set_null_still_work_after_correction(self):
        self.upgrade(OLD)
        self.seed_legacy()
        self.upgrade()
        with self.sessions() as db:
            db.add(AgentPolicyOverride(scope="group", scope_key="synthetic-legacy"))
            with self.assertRaises(sa.exc.IntegrityError):
                db.flush()
            db.rollback()
            db.add(AgentSkillCatalogEntry(key="r32-legacy", name="duplicate"))
            with self.assertRaises(sa.exc.IntegrityError):
                db.flush()
            db.rollback()
            db.add(AgentMemoryEntry(user_id=999999, content="invalid synthetic FK"))
            with self.assertRaises(sa.exc.IntegrityError):
                db.flush()
            db.rollback()
        with self.engine.begin() as c:
            c.exec_driver_sql("DELETE FROM conversations WHERE id=?", (self.conversation_id,))
            self.assertEqual(tuple(c.exec_driver_sql("SELECT conversation_id, content FROM agent_memory_entries WHERE id=11").one()), (None, "保留记忆"))
            self.assertEqual(c.exec_driver_sql("PRAGMA foreign_key_check").all(), [])

    def test_downgrade_refuses_to_restore_invalid_default_and_preserves_data_and_head(self):
        self.upgrade(OLD)
        self.seed_legacy()
        self.upgrade()
        before = self.snapshot()
        with patch.object(settings, "database_url", self.url), patch.object(sa, "engine_from_config", return_value=self.engine):
            with self.assertRaises(RuntimeError):
                command.downgrade(self.config, OLD)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.head(), (NEW,))

    def test_postgresql_branch_is_a_no_sql_change_without_connecting(self):
        output = io.StringIO()
        context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
        with Operations.context(context):
            migration_module().upgrade()
            migration_module().downgrade()
        self.assertEqual(output.getvalue(), "")

    def test_direct_second_correction_does_not_rebuild_already_supported_defaults(self):
        self.upgrade()
        before = self.snapshot()
        statements = []
        def capture(connection, cursor, statement, params, context, executemany):
            statements.append(statement.strip().upper())
        sa.event.listen(self.engine, "before_cursor_execute", capture)
        try:
            with self.engine.begin() as c, Operations.context(MigrationContext.configure(c)):
                migration_module().upgrade()
        finally:
            sa.event.remove(self.engine, "before_cursor_execute", capture)
        self.assertFalse(any(s.startswith(("CREATE ", "DROP ", "ALTER ", "INSERT ", "UPDATE ", "DELETE ")) for s in statements))
        self.assertEqual(self.snapshot(), before)

    def test_unknown_incoming_fk_view_and_custom_default_are_rejected_before_any_schema_change(self):
        self.upgrade(OLD)
        self.seed_legacy()
        with self.engine.begin() as c:
            c.exec_driver_sql("CREATE TABLE r32_extension (id INTEGER PRIMARY KEY, memory_id INTEGER REFERENCES agent_memory_entries(id) ON DELETE CASCADE)")
            c.exec_driver_sql("INSERT INTO r32_extension VALUES (1,11)")
        before = self.snapshot()
        with self.assertRaises(RuntimeError):
            self.upgrade()
        self.assertEqual(self.snapshot(), before)
        with self.engine.begin() as c:
            c.exec_driver_sql("DROP TABLE r32_extension")
            c.exec_driver_sql("CREATE VIEW r32_memory_view AS SELECT id, content FROM agent_memory_entries")
        before = self.snapshot()
        with self.assertRaises(RuntimeError):
            self.upgrade()
        self.assertEqual(self.snapshot(), before)
        with self.engine.begin() as c, Operations.context(MigrationContext.configure(c)):
            c.exec_driver_sql("DROP VIEW r32_memory_view")
            with Operations(MigrationContext.configure(c)).batch_alter_table("agent_policy_overrides") as batch:
                batch.alter_column("updated_at", server_default=sa.text("'custom historical default'"))
        before = self.snapshot()
        with self.assertRaises(RuntimeError):
            self.upgrade()
        self.assertEqual(self.snapshot(), before)

    def test_metadata_control_also_supports_the_three_normal_writes(self):
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for fk in table.foreign_keys:
                include(fk.column.table)
        for model in (AgentMemoryEntry, AgentPolicyOverride, AgentSkillCatalogEntry, AgentSkillRelease):
            include(model.__table__)
        # Explicit control only: real Alembic upgrade above forbids this method.
        AgentMemoryEntry.metadata.create_all(self.engine, tables=list(tables))
        self.parents()
        for kind in ("memory", "policy", "catalog"):
            self.write(kind)
