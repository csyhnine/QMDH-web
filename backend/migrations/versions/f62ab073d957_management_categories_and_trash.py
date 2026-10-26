"""Link planning roster identities and retain deleted projects in a recoverable trash."""
from alembic import op
import sqlalchemy as sa

revision = "f62ab073d957"
down_revision = "e51fa962c846"
branch_labels = None
depends_on = None


def upgrade():
    # batch mode supports SQLite as well as PostgreSQL; no business data or grants are seeded.
    with op.batch_alter_table("management_staff") as batch:
        batch.add_column(sa.Column("source_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_management_staff_source_user", "users", ["source_user_id"], ["id"])
        batch.create_unique_constraint("uq_management_staff_source_user", ["source_user_id"])
    op.add_column("management_projects", sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("management_projects", "deleted")
    with op.batch_alter_table("management_staff") as batch:
        batch.drop_constraint("uq_management_staff_source_user", type_="unique")
        batch.drop_constraint("fk_management_staff_source_user", type_="foreignkey")
        batch.drop_column("source_user_id")
