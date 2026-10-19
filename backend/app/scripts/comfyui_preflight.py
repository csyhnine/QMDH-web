"""Read-only tunnel/workflow checks. Does not enqueue a ComfyUI prompt."""
import json
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.provider_adapters.comfyui import BASE_URL, WORKFLOWS, load_workflow


def main():
    workflows = {}
    for key in sorted(WORKFLOWS):
        graph, mapping = load_workflow(Path(settings.comfyui_workflow_root), key)
        workflows[key] = {"sha256": mapping["sha256"], "nodes": len(graph), "output_node": mapping["output_node"]}
    try:
        with httpx.Client(trust_env=False, follow_redirects=False, timeout=5) as client:
            response = client.get(BASE_URL + "/system_stats")
            response.raise_for_status()
            assert isinstance(response.json(), dict)
        reachable = True
    except Exception:
        reachable = False
    print(json.dumps({"reachable": reachable, "workflows": workflows, "submitted_prompt": False}, indent=2))
    return 0 if reachable else 1


if __name__ == "__main__":
    raise SystemExit(main())
