"""Read model telemetry without interpreting missing Agent instrumentation as zero."""
from __future__ import annotations

import re


def _integer(value):
    return value if type(value) is int and value >= 0 else None


def read_model_observation(turn) -> dict:
    result = {"upstream_called": None, "upstream_observation": "legacy_unknown",
              "model_call_count": None, "model_call_count_complete": False,
              "model_run_id": None, "upstream_duration_ms": None,
              "first_response_ms": None, "ttft_ms": None}
    stages = turn.stage_events_json if isinstance(turn.stage_events_json, list) else []
    events = [item for item in stages if isinstance(item, dict) and item.get("label") == "model.observation"]
    if events:
        result["upstream_observation"] = "invalid"
        if len(events) != 1:
            return result
        event = events[0]
        count = _integer(event.get("call_count"))
        called, capture = event.get("upstream_called"), event.get("capture_state")
        run_id = event.get("run_id")
        complete = capture == "complete"
        expected = True if count else (False if complete else None)
        if (type(event.get("version")) is not int or event["version"] != 1
                or type(event.get("turn_id")) is not int or event["turn_id"] != turn.id
                or not isinstance(run_id, str) or re.fullmatch(r"[0-9a-f]{32}", run_id) is None
                or count is None or called is not expected or not isinstance(capture, str) or capture not in {"complete", "censored"}
                or event.get("mode") != "non_streaming"
                or type(event.get("duration_complete")) is not bool or event["duration_complete"] != complete
                or event.get("ttft_ms") is not None
                or event.get("ttft_basis") != "unavailable_non_streaming"):
            return result
        duration, response = event.get("request_duration_ms"), event.get("first_response_ms")
        if ((count > 0 and _integer(duration) is None) or (count == 0 and duration is not None)
                or (response is not None and (_integer(response) is None or count == 0))):
            return result
        calls = event.get("calls")
        if (not isinstance(calls, list) or len(calls) != min(count, 256)
                or event.get("identities_truncated") is not (count > len(calls))):
            return result
        identities = set()
        for sequence, call in enumerate(calls, 1):
            if not isinstance(call, dict):
                return result
            identity, status = call.get("call_id"), call.get("status")
            if (not isinstance(identity, str) or re.fullmatch(r"[0-9a-f]{32}", identity) is None
                    or identity in identities or type(call.get("sequence")) is not int or call["sequence"] != sequence
                    or not isinstance(status, str)
                    or status not in ({"succeeded", "error", "cancelled"} if complete else {"succeeded", "error", "cancelled", "censored"})):
                return result
            identities.add(identity)
        succeeded = any(call["status"] == "succeeded" for call in calls)
        if ((succeeded and response is None)
                or (response is not None and not succeeded and not event["identities_truncated"])):
            return result
        return {**result, "upstream_called": called, "upstream_observation": capture,
                "model_call_count": count, "model_call_count_complete": complete,
                "model_run_id": run_id, "upstream_duration_ms": duration if complete else None,
                "first_response_ms": response}
    labels = {item.get("label") for item in stages if isinstance(item, dict) and isinstance(item.get("label"), str)}
    agent = turn.agent_mode or str(turn.outcome or "").startswith("agent_")
    called = turn.upstream_called if type(turn.upstream_called) is bool else None
    if agent and not (called is True and "upstream.start" in labels):
        return result
    result.update(upstream_called=called, upstream_observation="legacy_known" if called is not None else "legacy_unknown")
    if called is True:
        duration = _integer(turn.upstream_duration_ms)
        result["upstream_duration_ms"] = duration if duration else None
        ttft = _integer(turn.ttft_ms)
        if not agent and ttft is not None and (ttft > 0 or "upstream.first_token" in labels):
            result["ttft_ms"] = ttft
    return result


def _stats(values: list[int]) -> tuple[int | None, int | None]:
    if not values:
        return None, None
    ordered = sorted(values)
    index = min(len(ordered)-1, max(0, int(round(.95 * (len(ordered)-1)))))
    return int(round(sum(values)/len(values))), ordered[index]


def aggregate_model_observations(turns) -> dict:
    facts = [read_model_observation(turn) for turn in turns]
    known = sum(fact["upstream_called"] is not None for fact in facts)
    called = sum(fact["upstream_called"] is True for fact in facts)
    ttft = [fact["ttft_ms"] for fact in facts if fact["ttft_ms"] is not None]
    response = [fact["first_response_ms"] for fact in facts if fact["first_response_ms"] is not None]
    counts = [fact["model_call_count"] for fact in facts if fact["model_call_count_complete"]]
    avg_ttft, p95_ttft = _stats(ttft)
    avg_response, p95_response = _stats(response)
    return {"upstream_metrics_version": 1, "upstream_known_turn_count": known,
            "upstream_unknown_turn_count": len(facts)-known, "upstream_called_turn_count": called,
            "upstream_call_rate": round(called/known, 4) if known else None,
            "ttft_sample_count": len(ttft), "avg_ttft_ms": avg_ttft, "p95_ttft_ms": p95_ttft,
            "first_response_sample_count": len(response), "avg_first_response_ms": avg_response,
            "p95_first_response_ms": p95_response, "model_call_count_total": sum(counts) if counts else None,
            "model_call_count_sample_count": len(counts)}
