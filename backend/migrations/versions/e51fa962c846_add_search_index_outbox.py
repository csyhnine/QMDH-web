"""Add durable per-domain search indexing state and coalesced entity intents."""
from alembic import op
import sqlalchemy as sa

revision = "e51fa962c846"
down_revision = "d40e9f82b735"
branch_labels = None
depends_on = None


def _sqlite_transaction():
    bind = op.get_bind()
    if bind.dialect.name == "sqlite" and not op.get_context().as_sql:
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
    return bind


def upgrade():
    _sqlite_transaction()
    op.create_table(
        "search_index_domains",
        sa.Column("domain", sa.String(32), primary_key=True),
        sa.Column("revision", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("active_index", sa.String(255), nullable=True),
        sa.Column("active_target_hash", sa.String(64), nullable=True),
        sa.Column("ready", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("uncertain", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("submission_token", sa.String(64), nullable=True),
        sa.Column("task_uid", sa.BigInteger(), nullable=True),
        sa.Column("task_entity_id", sa.Integer(), nullable=True),
        sa.Column("task_revision", sa.BigInteger(), nullable=True),
        sa.Column("task_operation", sa.String(16), nullable=True),
        sa.Column("task_index", sa.String(255), nullable=True),
        sa.Column("task_target_hash", sa.String(64), nullable=True),
        sa.Column("error_code", sa.String(80), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "search_index_intents",
        sa.Column("domain", sa.String(32), sa.ForeignKey("search_index_domains.domain"), primary_key=True),
        sa.Column("entity_id", sa.Integer(), primary_key=True),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("applied_revision", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("error_code", sa.String(80), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    domains = sa.table("search_index_domains", sa.column("domain", sa.String(32)))
    op.bulk_insert(domains, [{"domain": "inspiration"}, {"domain": "templates"}])


def downgrade():
    db = _sqlite_transaction()
    intents = db.execute(sa.text("SELECT count(*) FROM search_index_intents")).scalar_one()
    active = db.execute(sa.text("SELECT count(*) FROM search_index_domains WHERE revision <> 0 OR active_index IS NOT NULL OR ready OR uncertain OR task_uid IS NOT NULL OR submission_token IS NOT NULL")).scalar_one()
    if intents or active:
        raise RuntimeError("Refusing to discard search index recovery state")
    op.drop_table("search_index_intents")
    op.drop_table("search_index_domains")
