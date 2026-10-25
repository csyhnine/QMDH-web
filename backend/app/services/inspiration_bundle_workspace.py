"""Owned, exclusive bundle builds with atomic publication and bounded cleanup."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import time
from uuid import uuid4


def _identity(value):
    return value.st_dev, value.st_ino


def _version(path: Path):
    try:
        value = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(value.st_mode):
        raise FileExistsError("Bundle output is not a regular file")
    return *_identity(value), value.st_size, value.st_mtime_ns


class BundleWorkspace:
    def __init__(self, destination: Path):
        self.destination = destination.resolve()
        digest = hashlib.sha256(os.path.normcase(str(self.destination)).encode()).hexdigest()[:24]
        self.lock_path = self.destination.parent / f".qmdh-bundle-{digest}.lock"
        self.prefix = f".qmdh-bundle-{digest}-"
        self.root = self.payload = self.archive = None
        self._root_owner = self._lock_owner = self._lock_fd = None
        self._lock_created = False
        self._lock_data = b""
        self.cleanup_warnings, self.retained_paths = [], []

    def __enter__(self):
        self.destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._lock_fd = os.open(self.lock_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except OSError as exc:
            try:
                self.lock_path.lstat()
            except OSError:
                raise exc from None
            raise FileExistsError("Another bundle build owns this output, or its lock requires inspection") from None
        self._lock_created = True
        try:
            self._lock_owner = _identity(os.fstat(self._lock_fd))
            self._destination_version = _version(self.destination)
            self._lock_data = json.dumps({"version": 1, "token": uuid4().hex, "pid": os.getpid(),
                "created_at_ns": time.time_ns(), "destination": str(self.destination)}, sort_keys=True).encode()
            written = os.write(self._lock_fd, self._lock_data)
            if written != len(self._lock_data):
                self._lock_data = self._lock_data[:written]
                raise OSError("Bundle lock metadata was not fully written")
            self.root = Path(tempfile.mkdtemp(prefix=self.prefix, dir=self.destination.parent)).resolve()
            self._root_owner = _identity(self.root.lstat())
            self.payload, self.archive = self.root / "payload", self.root / "bundle.zip"
            self.payload.mkdir()
            return self
        except BaseException as exc:
            self._cleanup(exc)
            raise

    def publish(self) -> None:
        self.check_owned()
        if _version(self.destination) != self._destination_version:
            raise FileExistsError("Bundle output changed while this build was running")
        if self.archive is None or not self.archive.is_file():
            raise RuntimeError("Bundle archive is not ready")
        os.replace(self.archive, self.destination)

    def _owns_root(self) -> bool:
        if self.root is None:
            return False
        value = self.root.lstat()
        return (stat.S_ISDIR(value.st_mode) and _identity(value) == self._root_owner
                and self.root.resolve(strict=True) == self.root
                and self.root.parent == self.destination.parent
                and self.root.name.startswith(self.prefix))

    def check_owned(self) -> None:
        try:
            if not self._owns_root():
                raise RuntimeError("Bundle workspace ownership changed")
            value = self.lock_path.lstat()
            if (not stat.S_ISREG(value.st_mode) or _identity(value) != self._lock_owner
                    or self.lock_path.read_bytes() != self._lock_data):
                raise RuntimeError("Bundle output lock ownership changed")
        except OSError:
            raise RuntimeError("Bundle workspace ownership is unavailable") from None

    def _warn(self, code: str, path: Path) -> None:
        if code not in self.cleanup_warnings:
            self.cleanup_warnings.append(code)
        if str(path) not in self.retained_paths:
            self.retained_paths.append(str(path))

    def _cleanup(self, primary_error=None) -> None:
        if self.root is not None:
            try:
                # Verify the absolute, allocated target immediately before recursion.
                if not self._owns_root():
                    self._warn("staging_ownership_changed", self.root)
                else:
                    shutil.rmtree(self.root)
            except FileNotFoundError:
                pass
            except Exception:
                self._warn("staging_cleanup_failed", self.root)
        closed = True
        if self._lock_fd is not None:
            try:
                os.close(self._lock_fd)
            except Exception:
                closed = False
                self._warn("output_lock_close_failed", self.lock_path)
            self._lock_fd = None
        if closed and self._lock_owner is not None:
            try:
                value = self.lock_path.lstat()
                if (not stat.S_ISREG(value.st_mode) or _identity(value) != self._lock_owner
                        or self.lock_path.read_bytes() != self._lock_data):
                    self._warn("output_lock_ownership_changed", self.lock_path)
                else:
                    self.lock_path.unlink()
            except FileNotFoundError:
                pass
            except Exception:
                self._warn("output_lock_cleanup_failed", self.lock_path)
        elif self._lock_created and self._lock_owner is None:
            self._warn("output_lock_identity_unconfirmed", self.lock_path)
        if primary_error is not None and self.cleanup_warnings:
            primary_error.add_note("Bundle cleanup: " + ", ".join(self.cleanup_warnings)
                                   + "; retained paths require inspection: " + ", ".join(self.retained_paths))

    def __exit__(self, exc_type, exc, traceback):
        self._cleanup(exc)
        return False
