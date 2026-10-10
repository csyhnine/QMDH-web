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
    assert scripts.get_heads() == ["d5e6f7g8h9i0"]
    assert scripts.get_revision("d5e6f7g8h9i0").down_revision == "c4d5e6f7g8h9"
    assert scripts.get_revision("c4d5e6f7g8h9").down_revision == "b3c4d5e6f7g8"
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


def test_public_session_migration_preserves_account_credentials_and_refuses_history_loss():
    import pytest
    folder = Path(__file__).resolve().parents[1] / "migrations/versions"
    def load(filename):
        spec = importlib.util.spec_from_file_location(filename, folder / filename)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE agent_clients (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE user_feedbacks (id INTEGER PRIMARY KEY, status TEXT)"))
        with Operations.context(MigrationContext.configure(connection)):
            load("b3c4d5e6f7g8_skill_feedback.py").upgrade()
            load("c4d5e6f7g8h9_feedback_security.py").upgrade()
            connection.execute(text("INSERT INTO users VALUES (1)"))
            connection.execute(text("INSERT INTO skill_feedback_credentials (id,token_hash,owner_id,device_name,allowed_skills,expires_at) VALUES (1,'old',1,'device','[]','2026-11-10')"))
            connection.execute(text("INSERT INTO skill_feedback_issues (id,skill_name,skill_version,problem_code,title) VALUES (1,'research','1.0','missing_citation','old'),(2,'other','1.0','missing_citation','other')"))
            public = load("d5e6f7g8h9i0_feedback_public_sessions.py")
            public.upgrade()
            assert connection.execute(text("SELECT owner_id,public_grant_id,submission_count FROM skill_feedback_credentials")).one() == (1, None, 0)
            assert connection.execute(text("SELECT count(*) FROM skill_feedback_public_grants")).scalar_one() == 0
            assert connection.execute(text("SELECT skill_id,aggregation_key FROM skill_feedback_issues ORDER BY id")).all() == [(None, "legacy:research"), (None, "legacy:other")]
            public.downgrade()
            assert connection.execute(text("SELECT owner_id,token_hash FROM skill_feedback_credentials")).one() == (1, 'old')
            assert connection.execute(text("SELECT count(*) FROM skill_feedback_issues")).scalar_one() == 2
            public.upgrade()
            connection.execute(text("INSERT INTO skill_feedback_public_grants (id,skill_id,skill_name) VALUES (1,'qsk_00000000000000000000000000000000','research')"))
            connection.execute(text("INSERT INTO skill_feedback_credentials (id,token_hash,owner_id,public_grant_id,device_name,allowed_skills,expires_at) VALUES (2,'anonymous',NULL,1,'device','[]','2026-11-10')"))
            with pytest.raises(RuntimeError, match="preserve"):
                public.downgrade()
            assert connection.execute(text("SELECT count(*) FROM skill_feedback_credentials")).scalar_one() == 2
    engine.dispose()


def test_security_migration_preserves_legacy_links_and_refuses_destructive_downgrade():
    import pytest
    folder = Path(__file__).resolve().parents[1] / "migrations/versions"
    def load(filename):
        spec = importlib.util.spec_from_file_location(filename, folder / filename)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    initial = load("b3c4d5e6f7g8_skill_feedback.py")
    security = load("c4d5e6f7g8h9_feedback_security.py")
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE agent_clients (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE user_feedbacks (id INTEGER PRIMARY KEY, status TEXT)"))
        with Operations.context(MigrationContext.configure(connection)):
            initial.upgrade()
            connection.execute(text("INSERT INTO agent_clients VALUES (1)"))
            connection.execute(text("INSERT INTO users VALUES (1)"))
            connection.execute(text("INSERT INTO skill_feedback_runs (id,client_id,correlation_id,platform,skill_name,skill_version) VALUES (1,1,'task','codex','research','1.0')"))
            connection.execute(text("INSERT INTO skill_feedback_issues (id,skill_name,skill_version,problem_code,title) VALUES (1,'research','1.0','missing_citation','Citation')"))
            connection.execute(text("INSERT INTO skill_feedback_events (id,client_id,event_id,run_id,issue_id,source,event_type,payload_hash,occurred_at) VALUES (1,1,'e1',1,1,'human','problem','hash','2026-10-10')"))
            security.upgrade()
            assert connection.execute(text("SELECT client_id,credential_id,issue_id,review_status FROM skill_feedback_events")).one() == (1, None, 1, "legacy")
            security.downgrade()
            assert connection.execute(text("SELECT client_id,issue_id FROM skill_feedback_events")).one() == (1, 1)
            security.upgrade()
            connection.execute(text("INSERT INTO skill_feedback_credentials (id,token_hash,owner_id,device_name,allowed_skills,expires_at) VALUES (1,'test',1,'device','[]','2026-11-10')"))
            connection.execute(text("INSERT INTO skill_feedback_runs (id,credential_id,correlation_id,platform,skill_name,skill_version) VALUES (2,1,'new','codex','research','1.0')"))
            with pytest.raises(RuntimeError, match="preserve"):
                security.downgrade()
            assert connection.execute(text("SELECT count(*) FROM skill_feedback_runs")).scalar_one() == 2
    engine.dispose()
