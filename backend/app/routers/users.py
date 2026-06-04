from __future__ import annotations

import csv
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from io import StringIO
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user, normalize_user_role, require_user_admin
from app.core.config import AuthUserProfile
from app.core.security import hash_password
from app.database import get_db
from app.models import UsageLedger, User
from app.schemas import UserCreate, UserGroupSummaryOut, UserOut, UserPasswordReset, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])
VALID_ROLES = {"admin", "designer"}
VALID_BILLING_PLANS = {"internal", "trial", "standard", "pro", "enterprise"}
VALID_BILLING_STATUSES = {"active", "suspended", "grace"}
VALID_QUOTA_POLICIES = {"soft_warn", "hard_block", "unlimited"}
VALID_QUOTA_RESET_CYCLES = {"monthly"}
USER_GROUP_UNASSIGNED = ""
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
ROLE_ALIASES = {
    "owner": "admin",
    "admin": "admin",
    "ops": "admin",
    "designer": "designer",
}


def _validate_role(role: str) -> str:
    normalized = ROLE_ALIASES.get(role.strip().lower(), "")
    if normalized not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid user role")
    return normalized


def _validate_choice(value: str, allowed: set[str], field_name: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return normalized


def _normalize_group_name(value: str | None) -> str:
    if value is None:
        return USER_GROUP_UNASSIGNED
    return value.strip()


def _group_label(group_name: str) -> str:
    return group_name or "未分组"


def _shanghai_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=SHANGHAI_TZ).astimezone(timezone.utc)


def _parse_summary_window(start_date: str | None, end_date: str | None) -> tuple[datetime | None, datetime | None]:
    if not start_date and not end_date:
        return None, None
    try:
        start_day = date.fromisoformat(start_date) if start_date else None
        end_day = date.fromisoformat(end_date) if end_date else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date range, expected YYYY-MM-DD") from exc
    if start_day and end_day and start_day > end_day:
        raise HTTPException(status_code=400, detail="start_date cannot be later than end_date")
    window_start = _shanghai_day_start_utc(start_day) if start_day else None
    window_end = _shanghai_day_start_utc(end_day + timedelta(days=1)) if end_day else None
    return window_start, window_end


def _build_group_summaries(
    users: list[User],
    ledger_entries: list[UsageLedger],
) -> list[UserGroupSummaryOut]:
    group_rows: dict[str, dict[str, object]] = {}
    user_groups = {user.id: (user.group_name or USER_GROUP_UNASSIGNED) for user in users}
    user_index = {user.id: user for user in users}

    def ensure_group_row(group_name: str) -> dict[str, object]:
        row = group_rows.get(group_name)
        if row is None:
            row = {
                "group_name": group_name,
                "user_count": 0,
                "enabled_user_count": 0,
                "total_cost": 0.0,
                "currency_costs": Counter(),
                "member_rows": {},
            }
            group_rows[group_name] = row
        return row

    for user in users:
        row = ensure_group_row(user.group_name or USER_GROUP_UNASSIGNED)
        row["user_count"] = int(row["user_count"]) + 1
        if user.is_active:
            row["enabled_user_count"] = int(row["enabled_user_count"]) + 1
        member_rows = row["member_rows"]
        assert isinstance(member_rows, dict)
        member_rows[user.id] = {
            "user_id": user.id,
            "user_name": user.name,
            "display_name": user.display_name or user.name,
            "is_active": user.is_active,
            "total_cost": 0.0,
            "currency_costs": Counter(),
        }

    for entry in ledger_entries:
        if entry.user_id is None or entry.user_id not in user_index:
            continue
        group_name = user_groups.get(entry.user_id, USER_GROUP_UNASSIGNED)
        row = ensure_group_row(group_name)
        cost = round(float(entry.cost or 0.0), 4)
        currency = (entry.cost_currency or "CNY").upper()
        row["total_cost"] = round(float(row["total_cost"]) + cost, 4)
        currency_costs = row["currency_costs"]
        assert isinstance(currency_costs, Counter)
        currency_costs[currency] += cost
        member_rows = row["member_rows"]
        assert isinstance(member_rows, dict)
        member_row = member_rows.get(entry.user_id)
        if member_row is None:
            user = user_index[entry.user_id]
            member_row = {
                "user_id": user.id,
                "user_name": user.name,
                "display_name": user.display_name or user.name,
                "is_active": user.is_active,
                "total_cost": 0.0,
                "currency_costs": Counter(),
            }
            member_rows[entry.user_id] = member_row
        member_row["total_cost"] = round(float(member_row["total_cost"]) + cost, 4)
        member_currency_costs = member_row["currency_costs"]
        assert isinstance(member_currency_costs, Counter)
        member_currency_costs[currency] += cost

    summaries = []
    for row in group_rows.values():
        currency_costs = row["currency_costs"]
        assert isinstance(currency_costs, Counter)
        member_rows = row["member_rows"]
        assert isinstance(member_rows, dict)
        members = []
        for member in member_rows.values():
            member_currency_costs = member["currency_costs"]
            assert isinstance(member_currency_costs, Counter)
            members.append(
                {
                    "user_id": int(member["user_id"]),
                    "user_name": str(member["user_name"]),
                    "display_name": str(member["display_name"]),
                    "is_active": bool(member["is_active"]),
                    "total_cost": round(float(member["total_cost"]), 2),
                    "cost_by_currency": [
                        {"currency": currency, "total_cost": round(float(total_cost), 2)}
                        for currency, total_cost in member_currency_costs.most_common()
                    ],
                }
            )
        members.sort(key=lambda item: (-item["total_cost"], item["user_name"]))
        summaries.append(
            UserGroupSummaryOut(
                group_name=str(row["group_name"]),
                user_count=int(row["user_count"]),
                enabled_user_count=int(row["enabled_user_count"]),
                total_cost=round(float(row["total_cost"]), 2),
                cost_by_currency=[
                    {"currency": currency, "total_cost": round(float(total_cost), 2)}
                    for currency, total_cost in currency_costs.most_common()
                ],
                members=members,
            )
        )

    summaries.sort(key=lambda item: (-item.total_cost, _group_label(item.group_name)))
    return summaries


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        display_name=user.display_name or user.name,
        group_name=user.group_name or USER_GROUP_UNASSIGNED,
        role=normalize_user_role(user.role),
        is_active=user.is_active,
        monthly_quota=user.monthly_quota,
        billing_plan=user.billing_plan or "standard",
        billing_status=user.billing_status or "active",
        quota_policy=user.quota_policy or "soft_warn",
        quota_reset_cycle=user.quota_reset_cycle or "monthly",
        created_at=user.created_at,
        updated_at=user.updated_at or user.created_at,
        last_login_at=user.last_login_at,
    )


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserOut]:
    require_user_admin(auth_user)
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all()
    return [_to_user_out(user) for user in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserOut:
    require_user_admin(auth_user)
    existing = db.scalar(select(User).where(User.name == payload.name.strip()))
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")

    user = User(
        name=payload.name.strip(),
        display_name=payload.display_name.strip() or payload.name.strip(),
        group_name=_normalize_group_name(payload.group_name),
        role=_validate_role(payload.role),
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        project_codes=[],
        monthly_quota=payload.monthly_quota,
        billing_plan=_validate_choice(payload.billing_plan, VALID_BILLING_PLANS, "billing_plan"),
        billing_status=_validate_choice(payload.billing_status, VALID_BILLING_STATUSES, "billing_status"),
        quota_policy=_validate_choice(payload.quota_policy, VALID_QUOTA_POLICIES, "quota_policy"),
        quota_reset_cycle=_validate_choice(payload.quota_reset_cycle, VALID_QUOTA_RESET_CYCLES, "quota_reset_cycle"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    write_audit_log(
        db,
        event_type=AuditEventType.USER_CREATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="user",
        target_id=user.id,
        target_name=user.name,
        details={"role": user.role},
    )
    db.commit()

    return _to_user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserOut:
    require_user_admin(auth_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates = payload.model_dump(exclude_unset=True)
    if "display_name" in updates and updates["display_name"] is not None:
        user.display_name = updates["display_name"].strip() or user.name
    if "group_name" in updates and updates["group_name"] is not None:
        user.group_name = _normalize_group_name(updates["group_name"])
    if "role" in updates and updates["role"] is not None:
        user.role = _validate_role(updates["role"])
    if "is_active" in updates and updates["is_active"] is not None:
        if auth_user.user_id == user.id and not updates["is_active"]:
            raise HTTPException(status_code=400, detail="Cannot disable the current user")
        user.is_active = bool(updates["is_active"])
    if "monthly_quota" in updates:
        user.monthly_quota = updates["monthly_quota"]
    if "billing_plan" in updates and updates["billing_plan"] is not None:
        user.billing_plan = _validate_choice(updates["billing_plan"], VALID_BILLING_PLANS, "billing_plan")
    if "billing_status" in updates and updates["billing_status"] is not None:
        user.billing_status = _validate_choice(updates["billing_status"], VALID_BILLING_STATUSES, "billing_status")
    if "quota_policy" in updates and updates["quota_policy"] is not None:
        user.quota_policy = _validate_choice(updates["quota_policy"], VALID_QUOTA_POLICIES, "quota_policy")
    if "quota_reset_cycle" in updates and updates["quota_reset_cycle"] is not None:
        user.quota_reset_cycle = _validate_choice(
            updates["quota_reset_cycle"],
            VALID_QUOTA_RESET_CYCLES,
            "quota_reset_cycle",
        )

    db.commit()
    db.refresh(user)

    write_audit_log(
        db,
        event_type=AuditEventType.USER_UPDATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="user",
        target_id=user.id,
        target_name=user.name,
        details={"changes": updates},
    )
    db.commit()

    return _to_user_out(user)


@router.get("/groups/summary", response_model=list[UserGroupSummaryOut])
def list_user_group_summaries(
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserGroupSummaryOut]:
    require_user_admin(auth_user)

    users = list(db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all())
    window_start, window_end = _parse_summary_window(start_date, end_date)
    filters = [
        UsageLedger.user_id.is_not(None),
        UsageLedger.entry_type.in_(("task.finalized", "chat.message.completed")),
    ]
    if window_start is not None:
        filters.append(UsageLedger.recorded_at >= window_start)
    if window_end is not None:
        filters.append(UsageLedger.recorded_at < window_end)
    ledger_entries = list(db.scalars(select(UsageLedger).where(*filters)).all())
    return _build_group_summaries(users, ledger_entries)


@router.get("/groups/summary/export")
def export_user_group_summaries_csv(
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    require_user_admin(auth_user)

    users = list(db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all())
    window_start, window_end = _parse_summary_window(start_date, end_date)
    filters = [
        UsageLedger.user_id.is_not(None),
        UsageLedger.entry_type.in_(("task.finalized", "chat.message.completed")),
    ]
    if window_start is not None:
        filters.append(UsageLedger.recorded_at >= window_start)
    if window_end is not None:
        filters.append(UsageLedger.recorded_at < window_end)
    ledger_entries = list(db.scalars(select(UsageLedger).where(*filters)).all())
    summaries = _build_group_summaries(users, ledger_entries)

    csv_buffer = StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(
        [
            "group_name",
            "member_name",
            "member_display_name",
            "member_enabled",
            "group_user_count",
            "group_enabled_user_count",
            "group_total_cost",
            "group_cost_breakdown",
            "member_total_cost",
            "member_cost_breakdown",
            "start_date",
            "end_date",
        ]
    )
    for summary in summaries:
        breakdown = " / ".join(f"{row.total_cost:.2f} {row.currency}" for row in summary.cost_by_currency)
        if not summary.members:
            writer.writerow(
                [
                    _group_label(summary.group_name),
                    "",
                    "",
                    "",
                    summary.user_count,
                    summary.enabled_user_count,
                    f"{summary.total_cost:.2f}",
                    breakdown,
                    "",
                    "",
                    start_date or "",
                    end_date or "",
                ]
            )
            continue
        for member in summary.members:
            member_breakdown = " / ".join(
                f"{row.total_cost:.2f} {row.currency}" for row in member.cost_by_currency
            )
            writer.writerow(
                [
                    _group_label(summary.group_name),
                    member.user_name,
                    member.display_name,
                    "yes" if member.is_active else "no",
                    summary.user_count,
                    summary.enabled_user_count,
                    f"{summary.total_cost:.2f}",
                    breakdown,
                    f"{member.total_cost:.2f}",
                    member_breakdown,
                    start_date or "",
                    end_date or "",
                ]
            )

    filename_parts = ["group-spend"]
    if start_date:
        filename_parts.append(start_date)
    if end_date:
        filename_parts.append(end_date)
    filename = "-".join(filename_parts) + ".csv"
    return Response(
        content=csv_buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{user_id}/reset-password", response_model=UserOut)
def reset_user_password(
    user_id: int,
    payload: UserPasswordReset,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserOut:
    require_user_admin(auth_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)

    write_audit_log(
        db,
        event_type=AuditEventType.USER_PASSWORD_RESET,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="user",
        target_id=user.id,
        target_name=user.name,
    )
    db.commit()

    return _to_user_out(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    require_user_admin(auth_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if auth_user.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot disable the current user")
    user.is_active = False

    write_audit_log(
        db,
        event_type=AuditEventType.USER_DISABLED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="user",
        target_id=user.id,
        target_name=user.name,
    )
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
