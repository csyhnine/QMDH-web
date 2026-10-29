"""Offline preparation only: read approved files, never contact ComfyUI or a DB."""
import argparse
from copy import deepcopy
import json
from pathlib import Path

from app.services.provider_adapters.comfyui import load_workflow, prepare_graph, reference_input_count, verify_v11_dual


def check_bundle(root: Path) -> dict:
    report = {}
    mapping = json.loads((root / "workflow-map.json").read_text(encoding="utf-8-sig"))
    checks = [(key, None) for key in mapping]
    for key, value in mapping.items():
        checks.extend((key, int(count)) for count in value.get("reference_variants", {}))
    for workflow_id, variant_count in checks:
        graph, contract = load_workflow(root, workflow_id, reference_count=variant_count)
        if variant_count is not None:
            base, primary = load_workflow(root, workflow_id)
            verify_v11_dual(base, graph, primary, contract)
        original = deepcopy(graph)
        prepared = prepare_graph(graph, contract, {"prompt": "Offline contract validation", "width": 1024,
            "height": 1024}, seed=0, prefix="offline_validation")
        if graph != original:
            raise ValueError("Template was mutated")
        for node, field in contract["prompt"]:
            if prepared[node]["inputs"][field] != "Offline contract validation":
                raise ValueError("Prompt was not applied")
        for node, field in contract["seed"]:
            if prepared[node]["inputs"][field] != 0:
                raise ValueError("Zero seed was not applied")
        for node, field in contract.get("seed_consumers", []):
            if prepared[node]["inputs"][field] != graph[node]["inputs"][field]:
                raise ValueError("Shared seed link was overwritten")
        # All exported graph links must reference an existing node.
        for node in graph.values():
            for value in node["inputs"].values():
                if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and isinstance(value[1], int):
                    if value[0] not in graph:
                        raise ValueError(f"Missing linked node: {value[0]}")
        count = reference_input_count(contract) if contract["capability"] == "image.edit" else 0
        if contract.get("version") == "1.1":
            node, field = contract["steps"]
            if graph[node]["inputs"][field] != 50 or contract["steps_default"] != 50:
                raise ValueError("v1.1 sampler must retain 50 steps")
            caches = [node for node in graph.values() if node["class_type"] == "QwenImage21Cache"]
            if not caches or any(node["inputs"].get("device") != "gpu" for node in caches):
                raise ValueError("v1.1 cache must retain GPU device")
            if count:
                loaders = [key for key, node in graph.items() if node["class_type"] == "LoadImage"]
                if loaders != contract["image_loaders"] or len(loaders) != count:
                    raise ValueError("v1.1 edit must contain exactly the mapped loaders")
        report[workflow_id + (f":{variant_count}ref" if variant_count else "")] = {"filename": contract["filename"], "sha256": contract["sha256"],
            "version": contract.get("version", "legacy"), "reference_input_count": count,
            "output_node": contract["output_node"], "offline_contract": "passed", "gpu_tested": False}
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    print(json.dumps(check_bundle(parser.parse_args().root), ensure_ascii=False, indent=2))
