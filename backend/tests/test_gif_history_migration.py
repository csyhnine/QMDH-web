import importlib.util
from pathlib import Path
from unittest.mock import patch
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_gif_history_migration_is_repeatable_and_preserves_other_tables():
    path = Path(__file__).parents[1] / "migrations/versions/f7g8h9i0j1k2_gif_compression_history.py"
    spec = importlib.util.spec_from_file_location("gif_migration", path)
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO users VALUES (1)"))
        with patch.object(migration, "op", Operations(MigrationContext.configure(connection))):
            migration.upgrade(); migration.upgrade()
            connection.execute(sa.text("INSERT INTO gif_compression_records (user_id,file_name,original_storage_path,storage_path,compression,parameters) VALUES (1,'a.gif','original.gif','result.gif','{}','{}')"))
            assert connection.execute(sa.text("SELECT count(*) FROM gif_compression_records")).scalar_one() == 1
            migration.downgrade()
            assert connection.execute(sa.text("SELECT id FROM users")).scalar_one() == 1
    engine.dispose()
