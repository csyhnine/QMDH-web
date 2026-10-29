"""Content-free, per-turn observations of non-streaming model request attempts."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import threading
import time
from uuid import uuid4


class ModelCallObservation:
    MAX_IDENTITIES = 256

    def __init__(self, turn_id: int, *, started_at: float | None = None):
        self.turn_id = turn_id
        self.started_at = time.perf_counter() if started_at is None else started_at
        self.run_id = uuid4().hex
        self._lock = threading.RLock()
        self._calls, self._active = [], {}
        self._count = 0
        self._duration = 0.0
        self._first_response_ms = None
        self._run_finished = False
        self._closed = None

    def bind_run(self, run_id: str) -> None:
        with self._lock:
            if self._closed is None and not self._count:
                self.run_id = run_id

    def run(self, function, **kwargs):
        try:
            return function(model_observation=self, **kwargs)
        finally:
            with self._lock:
                self._run_finished = True

    def begin(self) -> str:
        with self._lock:
            identity = uuid4().hex
            if self._closed is not None:
                return identity
            self._count += 1
            now = time.perf_counter()
            call = {"call_id": identity, "sequence": self._count,
                    "start_ms": max(0, int((now - self.started_at) * 1000)),
                    "end_ms": None, "duration_ms": None, "status": "running"}
            self._active[identity] = (now, call)
            if len(self._calls) < self.MAX_IDENTITIES:
                self._calls.append(call)
            return identity

    def end(self, identity: str, status: str) -> None:
        with self._lock:
            active = self._active.pop(identity, None)
            if active is None or self._closed is not None:
                return
            start, call = active
            now = time.perf_counter()
            duration = max(0.0, now - start)
            self._duration += duration
            call.update(end_ms=max(0, int((now - self.started_at) * 1000)),
                        duration_ms=max(0, int(duration * 1000)),
                        status=status if status in {"succeeded", "error", "cancelled"} else "error")
            if status == "succeeded" and self._first_response_ms is None:
                self._first_response_ms = call["end_ms"]

    def snapshot(self, *, close: bool = False) -> dict:
        with self._lock:
            if self._closed is not None:
                return deepcopy(self._closed)
            now = time.perf_counter()
            calls = deepcopy(self._calls)
            for call in calls:
                if call["status"] == "running":
                    call["status"] = "censored"
            duration = self._duration + sum(max(0.0, now - start) for start, _ in self._active.values())
            complete = self._run_finished and not self._active
            result = {"label": "model.observation", "version": 1, "mode": "non_streaming",
                      "turn_id": self.turn_id, "run_id": self.run_id,
                      "capture_state": "complete" if complete else "censored",
                      "upstream_called": True if self._count else (False if complete else None),
                      "call_count": self._count, "calls": calls,
                      "identities_truncated": self._count > len(calls),
                      "duration_complete": complete,
                      "request_duration_ms": max(0, int(duration * 1000)) if self._count else None,
                      "first_response_ms": self._first_response_ms,
                      "ttft_ms": None, "ttft_basis": "unavailable_non_streaming"}
            if close:
                self._closed = deepcopy(result)
            return result


def observe_model(model, observation: ModelCallObservation):
    """Wrap the actual adapter; do not infer calls from harness/text events."""
    from pydantic_ai.models.wrapper import WrapperModel

    class ObservedModel(WrapperModel):
        async def request(self, *args, **kwargs):
            identity = observation.begin()
            try:
                result = await super().request(*args, **kwargs)
            except BaseException as exc:
                observation.end(identity, "cancelled" if isinstance(exc, asyncio.CancelledError) else "error")
                raise
            observation.end(identity, "succeeded")
            return result

    return ObservedModel(model)
