import importlib.util
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_media_type_migration_preserves_legacy_rows_and_is_bootstrap_safe():
    path = Path(__file__).parents[1] / "migrations/versions/e6f7g8h9i0j1_prompt_template_media_type.py"
    spec = importlib.util.spec_from_file_location("media_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE prompt_templates (id INTEGER PRIMARY KEY, prompt TEXT NOT NULL)"))
        connection.execute(sa.text("INSERT INTO prompt_templates VALUES (1, 'keep this prompt')"))
        with patch.object(migration, "op", Operations(MigrationContext.configure(connection))):
            migration.upgrade()
            migration.upgrade()
            assert connection.execute(sa.text("SELECT prompt, media_type FROM prompt_templates")).one() == ("keep this prompt", "image")
            migration.downgrade()
            assert connection.execute(sa.text("SELECT prompt FROM prompt_templates")).scalar_one() == "keep this prompt"
    engine.dispose()
