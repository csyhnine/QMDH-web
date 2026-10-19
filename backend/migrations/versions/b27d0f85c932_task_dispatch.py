"""Durable dispatch and user-scoped idempotency; additive, no history rewrite."""
from alembic import op
import sqlalchemy as sa

revision = "b27d0f85c932"
down_revision = "a16c9e74b821"
branch_labels = None
depends_on = None


def upgrade():
    from app.models import TaskDispatch, ReferenceUpload
    TaskDispatch.__table__.create(op.get_bind(), checkfirst=True)
    ReferenceUpload.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    # An operator must export outstanding dispatches before any explicit downgrade.
    op.drop_table("task_dispatches")
    op.drop_table("reference_uploads")
