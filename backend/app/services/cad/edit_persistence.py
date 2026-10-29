"""Stage new CAD media identities and publish their references in one DB commit."""
from contextvars import ContextVar
import copy
import logging
from pathlib import Path

from sqlalchemy import Text, cast, select, update

from app.models import CadExtract
from app.services import media_storage


logger = logging.getLogger(__name__)
_active_edit = ContextVar("cad_media_edit", default=None)


class CadEditConflict(RuntimeError):
    pass


class CadMediaEdit:
    def __init__(self):
        self.created = set()
        self.confirmed = False

    def __enter__(self):
        self.token = _active_edit.set(self)
        return self

    def __exit__(self, *args):
        # Failed/uncertain commits retain their stages; never delete a possible
        # committed version merely because its acknowledgement was lost.
        _active_edit.reset(self.token)

    def reclaim_unpublished(self, payload):
        if not self.confirmed:
            raise RuntimeError("CAD draft reclamation requires a confirmed commit")
        references = list(_payload_strings(payload))
        for path in sorted(self.created):
            if any(path in value or Path(path).name in value for value in references):
                continue
            try:
                _discard_created_local(path)
            except OSError:
                logger.warning("Retained unpublished CAD draft after cleanup failure: %s", path, exc_info=True)


def _payload_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from _payload_strings(key)
            yield from _payload_strings(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _payload_strings(item)


def _discard_created_local(path):
    media_storage.get_local_storage()._resolved_file(path).unlink(missing_ok=True)


def create_cad_media(path, content):
    result = media_storage.create_binary_asset(path, content)
    edit = _active_edit.get()
    if edit is not None:
        # Track only successful exclusive creates, never a colliding old key.
        edit.created.add(result)
    return result


def cad_edit_source(db, record):
    row = db.execute(select(CadExtract.payload_json.label("edit_payload"), cast(CadExtract.payload_json, Text).label("edit_payload_text")).where(
        CadExtract.id == record.id
    ).with_for_update(of=CadExtract)).first()
    if row is None or row[0] != record.payload_json:
        raise CadEditConflict("CAD extract changed; reload before editing")
    return copy.deepcopy(dict(row[0] or {})), row[1]


def commit_cad_edit(db, record, token, updated):
    try:
        connection = db.connection()
        if connection.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        result = db.execute(update(CadExtract).where(
            CadExtract.id == record.id, cast(CadExtract.payload_json, Text) == token
        ).values(payload_json=updated).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            raise CadEditConflict("CAD extract changed; reload before editing")
        db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise
    edit = _active_edit.get()
    if edit is not None:
        edit.confirmed = True
