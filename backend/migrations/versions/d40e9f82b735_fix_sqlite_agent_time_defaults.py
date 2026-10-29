"""Correct SQLite Agent timestamp defaults without changing historical rows.

Revision ID: d40e9f82b735
Revises: c39d8e71a624
"""
import re
import warnings

from alembic import op
import sqlalchemy as sa


revision = "d40e9f82b735"
down_revision = "c39d8e71a624"
branch_labels = None
depends_on = None

TIMESTAMPS = {
    "agent_policy_overrides": ("created_at", "updated_at"),
    "agent_memory_entries": ("created_at",),
    "agent_skill_catalog": ("created_at", "updated_at"),
}


def _corrections(bind) -> dict:
    inspector = sa.inspect(bind)
    available = set(inspector.get_table_names())
    changes = {}
    for table, names in TIMESTAMPS.items():
        if table not in available:
            raise RuntimeError(f"Missing historical table {table}; refusing a guessed schema repair")
        columns = {column["name"]: column for column in inspector.get_columns(table)}
        pending = []
        for name in names:
            if name not in columns:
                raise RuntimeError(f"Missing historical timestamp {table}.{name}")
            default = str(columns[name]["default"] or "").strip().lower()
            normalized = re.sub(r"[()\s]", "", default)
            if normalized == "now":
                pending.append(columns[name])
            elif normalized != "current_timestamp":
                raise RuntimeError(f"Custom timestamp default in {table}.{name}; explicit migration review required")
        if pending:
            changes[table] = pending
    # A SQLite parent-table rebuild can cascade into extension rows. Do not
    # disable FK enforcement or silently change unknown external dependencies.
    for table in available:
        for foreign_key in inspector.get_foreign_keys(table):
            if foreign_key["referred_table"] in changes:
                raise RuntimeError(f"Incoming FK from {table} requires a separate preservation plan")
    for view in inspector.get_view_names():
        definition = inspector.get_view_definition(view) or ""
        if any(re.search(r"\b" + re.escape(table) + r"\b", definition, re.IGNORECASE) for table in changes):
            raise RuntimeError(f"Dependent view {view} requires a separate preservation plan")
    return changes


def _rebuild_with_defaults(bind, table: str, columns: list[dict]) -> None:
    # SQLite expression indexes and triggers are not fully reflected by batch
    # mode. Keep their exact SQL and recreate only objects missing afterwards.
    objects = list(bind.execute(sa.text(
        "SELECT type,name,sql FROM sqlite_master WHERE tbl_name=:table "
        "AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name"
    ), {"table": table}))
    inspector = sa.inspect(bind)
    checks = tuple(sa.CheckConstraint(check["sqltext"]) for check in inspector.get_check_constraints(table) if not check["name"])
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=r"Skipped unsupported reflection of expression-based index .*", category=sa.exc.SAWarning)
        with op.batch_alter_table(table, recreate="always", table_args=checks) as batch:
            for column in columns:
                batch.alter_column(column["name"], existing_type=column["type"], existing_nullable=column["nullable"],
                                   server_default=sa.text("CURRENT_TIMESTAMP"))
    for kind, name, sql in objects:
        exists = bind.execute(sa.text("SELECT 1 FROM sqlite_master WHERE type=:kind AND name=:name"), {"kind": kind, "name": name}).first()
        if exists is None:
            bind.exec_driver_sql(sql)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        return  # PostgreSQL's existing now() defaults are valid.
    if op.get_context().as_sql:
        raise RuntimeError("SQLite timestamp correction requires live schema reflection")
    # A logical SQLAlchemy transaction alone does not make SQLite DDL atomic
    # under the legacy driver. Keep DDL and Alembic's version update together.
    if not bind.connection.driver_connection.in_transaction:
        bind.exec_driver_sql("BEGIN IMMEDIATE")
    with bind.begin_nested():
        changes = _corrections(bind)
        for table, columns in changes.items():
            _rebuild_with_defaults(bind, table, columns)


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        raise RuntimeError("Refusing to restore invalid SQLite now() defaults; preserve working schema and data")
