"""Metadata-only chat usage settlement and bounded operator recovery plans."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models import AuditLog, UsageLedger
from app.services.usage_ledger import record_chat_compaction_usage_ledger, record_chat_usage_ledger

KINDS = {
    "chat.agent.call": ("agent", "chat_agent_calls", "chat.completions"),
    "chat.context.compaction": ("compaction", "chat_compaction_calls", "chat.context_compact"),
    "chat.reply.call": ("reply", "chat_reply_calls", "chat.completions"),
}
COUNTERS = ("prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens",
            "cached_input_tokens", "uncached_input_tokens")


class InvalidReceipt(ValueError):
    pass


def _session(db: Session) -> Session:
    bind = db.get_bind()
    return Session(bind=bind.engine if isinstance(bind, Connection) else bind, expire_on_commit=False)


def _row(tx: Session, receipt_id: int, *, lock: bool = False) -> AuditLog | None:
    if lock and tx.get_bind().dialect.name == "sqlite":
        tx.connection().exec_driver_sql("UPDATE audit_logs SET id = id WHERE id = ?", (receipt_id,))
    query = select(AuditLog).where(AuditLog.id == receipt_id)
    return tx.scalar(query.with_for_update() if lock else query)


def _digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _integer(value, *, optional=False):
    if optional and value is None:
        return None
    if type(value) is not int or not 0 <= value <= 2_147_483_647:
        raise InvalidReceipt("invalid_integer")
    return value


def _text(value, limit=150):
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        raise InvalidReceipt("invalid_metadata")
    return value


def _finite(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise InvalidReceipt("invalid_pricing")
    return float(value)


def _binding(row: AuditLog) -> dict:
    if row.event_type not in KINDS:
        raise InvalidReceipt("unsupported_receipt")
    d = row.details
    if not isinstance(d, dict) or d.get("state") != "completed":
        raise InvalidReceipt("completion_unconfirmed")
    if d.get("usage_known") is not True:
        raise InvalidReceipt("usage_unknown")
    try:
        if not isinstance(d.get("usage"), dict) or not isinstance(d.get("pricing"), dict):
            raise InvalidReceipt("invalid_metadata")
        usage = {key: _integer(d["usage"][key]) for key in COUNTERS}
        pricing = d["pricing"]
        currency = _text(pricing["currency"], 12).upper()
        if not currency:
            raise InvalidReceipt("invalid_pricing")
        source = pricing["source"]
        if source not in {"provider_pricing_rules", "unpriced_chat", "missing_provider_profile"}:
            raise InvalidReceipt("invalid_pricing")
        rules = []
        for rule in pricing.get("rules", []):
            metric = rule["metric"]
            if metric not in {"input_tokens", "output_tokens", "cached_input_tokens"}:
                raise InvalidReceipt("invalid_pricing")
            size = _finite(rule["unit_size"] or 1) or 1
            price = _finite(rule["unit_price"] or 0)
            if _text(rule["currency"], 12).upper() != currency:
                raise InvalidReceipt("invalid_pricing")
            rules.append({"metric": metric, "unit_size": size, "unit_price": price, "currency": currency})
        if (source == "provider_pricing_rules") != bool(rules):
            raise InvalidReceipt("invalid_pricing")
        completed_at = datetime.fromisoformat(d["completed_at"]).isoformat()
        call_id = _text(d["call_id"], 128)
        if not call_id:
            raise InvalidReceipt("invalid_metadata")
        binding = {"receipt_id": row.id, "event_type": row.event_type, "call_id": call_id,
                   "actor_id": _integer(row.actor_id, optional=True), "actor_name": _text(row.actor_name, 100),
                   "conversation_id": _integer(d["conversation_id"]),
                   "conversation_user_id": _integer(d.get("conversation_user_id"), optional=True),
                   "provider_id": _integer(d.get("provider_id"), optional=True),
                   "provider_name": _text(d["provider_name"], 100), "model_name": _text(d["model_name"]),
                   "completed_at": completed_at, "usage": usage,
                   "pricing": {"source": source, "currency": currency, "rules": rules}}
        if row.event_type == "chat.context.compaction":
            binding["until_message_id"] = _integer(d["until_message_id"])
            if binding["until_message_id"] <= 0:
                raise InvalidReceipt("invalid_metadata")
        return binding
    except InvalidReceipt:
        raise
    except (ValueError, TypeError, KeyError, OverflowError):
        raise InvalidReceipt("invalid_metadata") from None


def _billing(binding: dict) -> dict:
    usage, pricing = binding["usage"], binding["pricing"]
    cost, units = 0.0, 0.0
    for rule in pricing["rules"]:
        amount = usage["uncached_input_tokens"] if rule["metric"] == "input_tokens" else usage[rule["metric"]]
        units += amount
        cost += round(amount / rule["unit_size"] * rule["unit_price"], 6)
    if not math.isfinite(cost) or not math.isfinite(units):
        raise InvalidReceipt("invalid_pricing")
    return {"cost": round(cost, 4), "currency": pricing["currency"], "billable_units": round(units, 4)}


def _ledger(tx: Session, binding: dict) -> UsageLedger | None:
    source = KINDS[binding["event_type"]][1]
    # A receipt has one global ID. Changing its kind must not create a second
    # ledger for the same call under another source namespace.
    rows = tx.scalars(select(UsageLedger).where(
        UsageLedger.source_table.in_([spec[1] for spec in KINDS.values()]),
        UsageLedger.source_id == binding["receipt_id"],
    )).all()
    for row in rows:
        if (row.source_table != source and isinstance(row.usage_payload, dict)
                and row.usage_payload.get("call_id") == binding["call_id"]):
            raise InvalidReceipt("ledger_conflict")
    return next((row for row in rows if row.source_table == source), None)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _matches(ledger: UsageLedger, binding: dict) -> bool:
    bill = _billing(binding)
    owner = binding["actor_id"] if binding["actor_id"] is not None else binding["conversation_user_id"]
    if not isinstance(ledger.cost, (int, float)) or not isinstance(ledger.billable_units, (int, float)):
        return False
    return (isinstance(ledger.usage_payload, dict) and ledger.usage_payload.get("call_id") == binding["call_id"]
            and all(getattr(ledger, key) == value for key, value in binding["usage"].items())
            and ledger.user_id == owner and ledger.user_name == binding["actor_name"]
            and ledger.provider_name == binding["provider_name"] and ledger.model_name == binding["model_name"]
            and ledger.workflow_key == KINDS[binding["event_type"]][2]
            and ledger.entry_type == "chat.message.completed" and ledger.billing_unit == "chat_tokens"
            and ledger.project_code == "__chat__" and ledger.output_count == 1
            and isinstance(ledger.recorded_at, datetime)
            and _utc(ledger.recorded_at) == _utc(datetime.fromisoformat(binding["completed_at"]))
            and ledger.cost_currency == bill["currency"]
            and math.isclose(ledger.cost, bill["cost"], rel_tol=0, abs_tol=1e-8)
            and math.isclose(ledger.billable_units, bill["billable_units"], rel_tol=0, abs_tol=1e-8))


def settle_chat_usage_receipt(db: Session, receipt_id: int, *, expected_event: str,
                              writer=None, expected_digest: str | None = None) -> bool:
    """One known call, one unique ledger. No content, provider SDK or memory."""
    try:
        with _session(db) as tx:
            row = _row(tx, receipt_id, lock=True)
            if row is None or row.event_type != expected_event:
                return False
            binding = _binding(row)
            if expected_digest is not None and _digest(binding) != expected_digest:
                return False
            ledger = _ledger(tx, binding)
            if ledger is not None:
                if not _matches(ledger, binding):
                    return False
            else:
                provider = SimpleNamespace(id=binding["provider_id"], provider_name=binding["provider_name"], model_name=binding["model_name"])
                kwargs = dict(conversation=SimpleNamespace(id=binding["conversation_id"], user_id=binding["conversation_user_id"]),
                              provider=provider, provider_profile_id=binding["provider_id"], user_id=binding["actor_id"], user_name=binding["actor_name"],
                              usage_payload={**binding["usage"], "source": "chat_context_compact" if expected_event == "chat.context.compaction" else "chat_agent" if expected_event == "chat.agent.call" else "chat_reply",
                                             "call_id": binding["call_id"]}, billing_snapshot=_billing(binding),
                              recorded_at=datetime.fromisoformat(binding["completed_at"]))
                if expected_event == "chat.context.compaction":
                    writer = record_chat_compaction_usage_ledger if writer is None else writer
                    writer(tx, until_message_id=binding["until_message_id"], call_receipt_id=receipt_id, **kwargs)
                else:
                    writer = record_chat_usage_ledger if writer is None else writer
                    writer(tx, message=SimpleNamespace(id=receipt_id, created_at=kwargs["recorded_at"]),
                           source_table=KINDS[expected_event][1], **kwargs)
                tx.flush()
                ledger = _ledger(tx, binding)
                if ledger is None or not _matches(ledger, binding):
                    raise InvalidReceipt("settlement_unconfirmed")
            row.details = {**row.details, "ledger_status": "recorded"}
            tx.commit()
            return True
    except Exception:
        try:
            with _session(db) as check:
                row = _row(check, receipt_id)
                if row is None or row.event_type != expected_event:
                    return False
                binding = _binding(row)
                ledger = _ledger(check, binding)
                return (ledger is not None and _matches(ledger, binding)
                        and (expected_digest is None or _digest(binding) == expected_digest))
        except Exception:
            return False


def _ids(receipt_ids) -> list[int]:
    ids = list(receipt_ids)
    if not 1 <= len(ids) <= 50 or any(type(i) is not int or not 1 <= i <= 2_147_483_647 for i in ids) or len(set(ids)) != len(ids):
        raise ValueError("invalid_receipt_ids")
    return sorted(ids)


def _item(tx: Session, receipt_id: int) -> dict:
    row = _row(tx, receipt_id)
    item = {"receipt_id": receipt_id, "kind": KINDS.get(row.event_type, ("unsupported",))[0] if row is not None else "missing"}
    try:
        if row is None:
            raise InvalidReceipt("receipt_missing")
        binding = _binding(row)
        bill = _billing(binding)
        ledger = _ledger(tx, binding)
        if ledger is not None and not _matches(ledger, binding):
            raise InvalidReceipt("ledger_conflict")
        owner = binding["actor_id"] if binding["actor_id"] is not None else binding["conversation_user_id"]
        return {**item, "status": "pending" if ledger is None else "recorded", "owner_id": owner, "provider_id": binding["provider_id"],
                "tokens": binding["usage"]["total_tokens"],
                "currency": bill["currency"], "cost": bill["cost"], "digest": _digest(binding), "event_type": row.event_type}
    except InvalidReceipt as exc:
        return {**item, "status": "blocked", "code": str(exc), "digest": _digest([receipt_id, "blocked", str(exc)])}


def recovery_plan(db: Session, receipt_ids) -> dict:
    ids = _ids(receipt_ids)
    with _session(db) as tx:
        items = [_item(tx, receipt_id) for receipt_id in ids]
    bind = db.get_bind()
    engine = bind.engine if isinstance(bind, Connection) else bind
    url = engine.url
    if url.get_backend_name() == "sqlite" and url.database not in {None, "", ":memory:"}:
        url = url.set(database=str(Path(url.database).resolve()))
    target = _digest(url.render_as_string(hide_password=True))
    return {"digest": _digest([target, [[i["receipt_id"], i["digest"]] for i in items]]),
            "blocked": sum(i["status"] == "blocked" for i in items), "items": items}


def apply_recovery_plan(db: Session, receipt_ids, expected_digest: str) -> tuple[dict, int]:
    plan = recovery_plan(db, receipt_ids)
    if plan["blocked"]:
        return {**plan, "mode": "apply", "code": "preflight_blocked"}, 2
    if plan["digest"] != expected_digest:
        return {**plan, "mode": "apply", "code": "stale_plan"}, 2
    results = []
    for item in plan["items"]:
        ok = settle_chat_usage_receipt(db, item["receipt_id"], expected_event=item["event_type"], expected_digest=item["digest"])
        try:
            with _session(db) as tx:
                after = _item(tx, item["receipt_id"])
            ok = ok and after["status"] == "recorded" and after["digest"] == item["digest"]
            results.append({**after, "status": "recorded" if ok else "unconfirmed"})
        except Exception:
            ok = False
            results.append({"receipt_id": item["receipt_id"], "kind": item["kind"], "status": "unconfirmed", "code": "database_unavailable"})
    failed = sum(i["status"] != "recorded" for i in results)
    return {"mode": "apply", "digest": plan["digest"], "items": results, "unconfirmed": failed}, 1 if failed else 0
