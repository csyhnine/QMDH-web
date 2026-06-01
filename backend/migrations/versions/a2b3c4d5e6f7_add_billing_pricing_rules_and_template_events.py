"""add billing pricing rules and template events

Revision ID: a2b3c4d5e6f7
Revises: f7a8b9c0d1e2
Create Date: 2026-06-01 16:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a2b3c4d5e6f7"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("billing_plan", sa.String(length=30), nullable=False, server_default="standard"))
    op.add_column("users", sa.Column("billing_status", sa.String(length=20), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("quota_policy", sa.String(length=20), nullable=False, server_default="soft_warn"))
    op.add_column("users", sa.Column("quota_reset_cycle", sa.String(length=20), nullable=False, server_default="monthly"))

    op.add_column("usage_ledgers", sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledgers", sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledgers", sa.Column("cached_input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledgers", sa.Column("uncached_input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledgers", sa.Column("usage_payload", sa.JSON(), nullable=False, server_default="{}"))

    op.create_table(
        "prompt_template_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("context", sa.String(length=30), nullable=False, server_default="studio"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["template_id"], ["prompt_templates.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_prompt_template_events_template_id"), "prompt_template_events", ["template_id"], unique=False)
    op.create_index(op.f("ix_prompt_template_events_user_id"), "prompt_template_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_prompt_template_events_event_type"), "prompt_template_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_prompt_template_events_context"), "prompt_template_events", ["context"], unique=False)
    op.create_index(op.f("ix_prompt_template_events_created_at"), "prompt_template_events", ["created_at"], unique=False)

    op.create_table(
        "provider_pricing_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_profile_id", sa.Integer(), nullable=False),
        sa.Column("capability", sa.String(length=50), nullable=False),
        sa.Column("metric", sa.String(length=40), nullable=False),
        sa.Column("unit_size", sa.Float(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=12), nullable=False, server_default="CNY"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["provider_profile_id"], ["provider_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_provider_pricing_rules_provider_profile_id"),
        "provider_pricing_rules",
        ["provider_profile_id"],
        unique=False,
    )
    op.create_index(op.f("ix_provider_pricing_rules_capability"), "provider_pricing_rules", ["capability"], unique=False)
    op.create_index(op.f("ix_provider_pricing_rules_metric"), "provider_pricing_rules", ["metric"], unique=False)
    op.create_index(op.f("ix_provider_pricing_rules_is_active"), "provider_pricing_rules", ["is_active"], unique=False)

    op.alter_column("users", "billing_plan", server_default=None)
    op.alter_column("users", "billing_status", server_default=None)
    op.alter_column("users", "quota_policy", server_default=None)
    op.alter_column("users", "quota_reset_cycle", server_default=None)
    op.alter_column("usage_ledgers", "input_tokens", server_default=None)
    op.alter_column("usage_ledgers", "output_tokens", server_default=None)
    op.alter_column("usage_ledgers", "cached_input_tokens", server_default=None)
    op.alter_column("usage_ledgers", "uncached_input_tokens", server_default=None)
    op.alter_column("usage_ledgers", "usage_payload", server_default=None)
    op.alter_column("provider_pricing_rules", "unit_size", server_default=None)
    op.alter_column("provider_pricing_rules", "unit_price", server_default=None)
    op.alter_column("provider_pricing_rules", "currency", server_default=None)
    op.alter_column("provider_pricing_rules", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_provider_pricing_rules_is_active"), table_name="provider_pricing_rules")
    op.drop_index(op.f("ix_provider_pricing_rules_metric"), table_name="provider_pricing_rules")
    op.drop_index(op.f("ix_provider_pricing_rules_capability"), table_name="provider_pricing_rules")
    op.drop_index(op.f("ix_provider_pricing_rules_provider_profile_id"), table_name="provider_pricing_rules")
    op.drop_table("provider_pricing_rules")

    op.drop_index(op.f("ix_prompt_template_events_created_at"), table_name="prompt_template_events")
    op.drop_index(op.f("ix_prompt_template_events_context"), table_name="prompt_template_events")
    op.drop_index(op.f("ix_prompt_template_events_event_type"), table_name="prompt_template_events")
    op.drop_index(op.f("ix_prompt_template_events_user_id"), table_name="prompt_template_events")
    op.drop_index(op.f("ix_prompt_template_events_template_id"), table_name="prompt_template_events")
    op.drop_table("prompt_template_events")

    op.drop_column("usage_ledgers", "usage_payload")
    op.drop_column("usage_ledgers", "uncached_input_tokens")
    op.drop_column("usage_ledgers", "cached_input_tokens")
    op.drop_column("usage_ledgers", "output_tokens")
    op.drop_column("usage_ledgers", "input_tokens")

    op.drop_column("users", "quota_reset_cycle")
    op.drop_column("users", "quota_policy")
    op.drop_column("users", "billing_status")
    op.drop_column("users", "billing_plan")
