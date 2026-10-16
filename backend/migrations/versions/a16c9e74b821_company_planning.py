"""Separate company management permissions and planning documents."""
from alembic import op
import sqlalchemy as sa

revision = "a16c9e74b821"
down_revision = "f7g8h9i0j1k2"
branch_labels = None
depends_on = None


def upgrade():
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    for col in (sa.Column("company_management", sa.Boolean(), nullable=False, server_default=sa.false()),
                sa.Column("company_unit", sa.String(120), nullable=False, server_default=""),
                sa.Column("company_position", sa.String(120), nullable=False, server_default="")):
        if col.name not in columns:
            op.add_column("users", col)
    tables = {
        "management_reports": [sa.Column("unit", sa.String(120), nullable=False), sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False), sa.Column("document", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("unit", "year")],
        "management_staff": [sa.Column("unit", sa.String(120), nullable=False, index=True), sa.Column("name", sa.String(150), nullable=False),
            sa.Column("position", sa.String(120), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False), sa.Column("version", sa.Integer(), nullable=False)],
        "management_projects": [sa.Column("unit", sa.String(120), nullable=False, index=True), sa.Column("year", sa.Integer(), nullable=False, index=True),
            sa.Column("version", sa.Integer(), nullable=False), sa.Column("document", sa.JSON(), nullable=False), sa.Column("archived", sa.Boolean(), nullable=False),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())],
        "management_revisions": [sa.Column("project_id", sa.Integer(), sa.ForeignKey("management_projects.id"), nullable=False, index=True),
            sa.Column("version", sa.Integer(), nullable=False), sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())],
    }
    for name, cols in tables.items():
        if not sa.inspect(op.get_bind()).has_table(name):
            op.create_table(name, sa.Column("id", sa.Integer(), primary_key=True), *cols)


def downgrade():
    for table in ("management_revisions", "management_projects", "management_staff", "management_reports"):
        op.drop_table(table)
    for col in ("company_position", "company_unit", "company_management"):
        op.drop_column("users", col)
