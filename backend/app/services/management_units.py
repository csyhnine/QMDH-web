"""Planning categories do not move login groups or grant company permissions."""
from collections import Counter

from sqlalchemy import select

from app.models import ManagementStaff, User

PLANNING_UNITS = ("一分院", "二分院", "三分院")
ALIASES = {
    "一分院": "一分院", "城市更新一分院": "一分院",
    "二分院": "二分院", "城市更新二分院": "二分院",
    "四分院": "二分院", "城市更新四分院": "二分院",
    "三分院": "三分院", "城市更新三分院": "三分院",
}


def canonical_unit(value):
    value = (value or "").strip()
    return ALIASES.get(value, value)


def unit_aliases(value):
    unit = canonical_unit(value)
    return tuple({unit, *(key for key, target in ALIASES.items() if target == unit)})


def account_unit(user):
    # Admin service accounts are not employees merely because they can manage a unit.
    group = canonical_unit(user.group_name)
    if group in PLANNING_UNITS:
        return group
    unit = canonical_unit(user.company_unit)
    return unit if unit in PLANNING_UNITS and user.role not in ("admin", "ops") else None


def sync_staff(db, unit):
    """Explicit, idempotent roster import; preserves IDs, manual edits and grants."""
    unit = canonical_unit(unit)
    # Serialize syncs for this category, including its first import, without a new lock table.
    # Existing manager accounts provide a stable row; take the lock in a fixed order.
    db.scalars(select(User).where(User.company_management.is_(True))
               .order_by(User.id).with_for_update()).all()
    people = [u for u in db.scalars(select(User).order_by(User.id)).all() if account_unit(u) == unit]
    rows = list(db.scalars(select(ManagementStaff).where(ManagementStaff.unit.in_(unit_aliases(unit)))
                           .order_by(ManagementStaff.id).with_for_update()).all())
    linked = {s.source_user_id: s for s in rows if s.source_user_id is not None}
    name_counts = Counter((u.display_name or u.name).strip() for u in people)
    added = matched = 0
    conflicts = []
    for user in people:
        if user.id in linked:
            continue
        name = (user.display_name or user.name).strip()
        matches = [s for s in rows if s.name.strip() == name and s.source_user_id is None]
        if name_counts[name] != 1 or len(matches) > 1:
            conflicts.append(name)
            continue
        existing = db.scalar(select(ManagementStaff).where(ManagementStaff.source_user_id == user.id))
        if existing is not None:
            # A transfer needs explicit handling; never move historical assignments silently.
            conflicts.append(name)
            continue
        if matches:
            row = matches[0]
            row.source_user_id = user.id
            row.version += 1
            matched += 1
        else:
            row = ManagementStaff(unit=unit, name=name, position=user.company_position or "",
                                  is_active=user.is_active, source_user_id=user.id)
            db.add(row)
            rows.append(row)
            added += 1
        linked[user.id] = row
    db.flush()
    return {"unit": unit, "added": added, "matched": matched, "total": len(rows), "conflicts": conflicts}
