"""Lossless reference history projection, independent of provider execution limits."""


def reference_image_storage_paths(payload: dict) -> list[str]:
    for key in ("reference_images", "source_images"):
        raw = payload.get(key)
        if isinstance(raw, list):
            cleaned = [value for item in raw if (value := str(item or "").strip())]
            if cleaned:
                return cleaned
    for key in ("reference_image", "source_image", "image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return [value]
    return []


def reference_image_result_fields(payload: dict) -> dict[str, object]:
    paths = reference_image_storage_paths(payload)
    return {
        "reference_image_supplied": bool(paths),
        "reference_image_count": len(paths),
        "reference_image_storage_path": paths[0] if paths else "",
        "reference_image_storage_paths": paths,
    }


def project_reference_history(payload: dict | None, result: dict) -> dict:
    """Project saved inputs for an authorized task response, without changing rows."""
    projected = dict(result)
    payload = payload if isinstance(payload, dict) else {}
    saved_sku = str(payload.get("video_sku") or "").strip()
    if saved_sku and not str(result.get("video_sku") or "").strip():
        projected["video_sku"] = saved_sku
    if any(key in payload for key in ("reference_images", "source_images", "reference_image", "source_image", "image")):
        projected.update(reference_image_result_fields(payload))
        projected.update(reference_image_history_source="task_payload", reference_image_history_incomplete=False)
        return projected

    paths = reference_image_storage_paths({
        "reference_images": result.get("reference_image_storage_paths"),
        "reference_image": result.get("reference_image_storage_path"),
    })
    try:
        count = max(len(paths), int(result.get("reference_image_count") or 0))
    except (ValueError, TypeError, OverflowError):
        count = len(paths)
    supplied = bool(paths or count or result.get("reference_image_supplied"))
    recorded = any(key in result for key in (
        "reference_image_storage_paths", "reference_image_storage_path", "reference_image_count", "reference_image_supplied"
    ))
    projected.update({
        "reference_image_supplied": supplied,
        "reference_image_count": count,
        "reference_image_storage_path": paths[0] if paths else "",
        "reference_image_storage_paths": paths,
        "reference_image_history_source": "recorded_result" if recorded else "unavailable",
        "reference_image_history_incomplete": count > len(paths) or (supplied and not paths),
    })
    return projected
