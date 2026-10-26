"""Separate planning unit from employment affiliation without guessing existing identities."""
from alembic import op
import sqlalchemy as sa

revision = "a83cd184e068"
down_revision = "f62ab073d957"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("management_staff", sa.Column("employment_type", sa.String(20), nullable=False, server_default="unknown"))
    op.add_column("management_staff", sa.Column("employer", sa.String(150), nullable=False, server_default=""))


def downgrade():
    op.drop_column("management_staff", "employer")
    op.drop_column("management_staff", "employment_type")
