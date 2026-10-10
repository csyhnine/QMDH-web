import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text


def test_repository_migration_chain_has_single_new_head():
    backend = Path(__file__).resolve().parents[1]
    config = Config()
    config.set_main_option("script_location", str(backend / "migrations"))
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_heads() == ["b3c4d5e6f7g8"]
    assert scripts.get_revision("b3c4d5e6f7g8").down_revision == "z1a2b3c4d5e6"
    assert len(list(scripts.walk_revisions())) > 1


def test_skill_feedback_upgrade_downgrade_preserves_existing_feedback():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/b3c4d5e6f7g8_skill_feedback.py"
    spec = importlib.util.spec_from_file_location("skill_feedback_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE agent_clients (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE user_feedbacks (id INTEGER PRIMARY KEY, status TEXT)"))
        connection.execute(text("INSERT INTO user_feedbacks VALUES (1, 'replied')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(text("SELECT status, improvement_status FROM user_feedbacks")).one() == ("replied", "pending_analysis")
            assert {"skill_feedback_runs", "skill_feedback_events", "skill_feedback_issues"} <= set(inspect(connection).get_table_names())
            migration.downgrade()
        assert connection.execute(text("SELECT status FROM user_feedbacks")).scalar_one() == "replied"
        assert "skill_feedback_events" not in inspect(connection).get_table_names()
    engine.dispose()
