"""Build an offline single/dual-image bundle from the v1.1 single-image export.

Never modifies the supplied bundle, contacts ComfyUI, or submits GPU work.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from app.services.provider_adapters.comfyui import reference_input_count, verify_v11_dual

EDIT = "qwen_image_2_1_image_edit"


def build_bundle(map_file: Path, graph_dir: Path, output: Path) -> dict:
    if output.exists():
        raise ValueError("Output must be a new directory; existing workflow files are never overwritten")
    manifest = json.loads(map_file.read_text(encoding="utf-8-sig"))
    mapping = manifest[EDIT]
    if mapping.get("version") != "1.1" or reference_input_count(mapping) != 1 or mapping.get("reference_variants"):
        raise ValueError("Start from the original v1.1 single-image mapping")
    sources = {}
    for contract in manifest.values():
        name = contract["filename"]
        if Path(name).name != name:
            raise ValueError("Workflow filenames must be flat")
        data = (graph_dir / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != contract["sha256"]:
            raise ValueError("Input workflow SHA mismatch")
        sources[name] = data
    base = json.loads(sources[mapping["filename"]].decode("utf-8-sig"))
    node, field = mapping["steps"]
    if base[node]["inputs"][field] != 50 or mapping["steps_default"] != 50:
        raise ValueError("v1.1 must retain 50 steps")
    caches = [v for v in base.values() if v["class_type"] == "QwenImage21Cache"]
    if not caches or any(v["inputs"].get("device") != "gpu" for v in caches):
        raise ValueError("v1.1 cache device must remain gpu")
    loader = mapping["image_loaders"][0]
    dual = deepcopy(base)
    dual["475"] = deepcopy(base[loader])
    dual["475"]["inputs"]["image"] = "qmdh_reference_2.png"
    dual["459:474"]["inputs"]["images.image_2"] = ["475", 0]
    dual["459:485"]["inputs"]["images.image1"] = ["475", 0]
    raw = (json.dumps(dual, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    contract = {**deepcopy(mapping), "filename": "qwen_image_2_1_image_edit-v1.1-2ref-api.json",
                "sha256": hashlib.sha256(raw).hexdigest(), "image_loaders": [loader, "475"],
                "reference_input_count": 2, "derived_from_sha256": mapping["sha256"]}
    verify_v11_dual(base, dual, mapping, contract)
    manifest[EDIT] = {**mapping, "reference_variants": {"2": contract}}
    output.mkdir(parents=True)
    for name, data in sources.items():
        (output / name).write_bytes(data)
    (output / contract["filename"]).write_bytes(raw)
    (output / "workflow-map.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    from app.scripts.check_comfyui_workflows import check_bundle
    return check_bundle(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map-file", type=Path, required=True)
    parser.add_argument("--graph-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build_bundle(args.map_file, args.graph_dir, args.output), ensure_ascii=False, indent=2))
