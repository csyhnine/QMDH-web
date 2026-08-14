import unittest
from types import SimpleNamespace

from app.routers.dashboard import _infer_task_capability


class DashboardCapabilityInferenceTests(unittest.TestCase):
    def test_prefers_ledger_capability_over_workflow_fallback(self) -> None:
        entry = SimpleNamespace(
            capability="video.generate",
            workflow_key="image-generate",
        )
        self.assertEqual(_infer_task_capability(entry, []), "video.generate")

    def test_falls_back_to_workflow_key_when_capability_missing(self) -> None:
        entry = SimpleNamespace(
            capability="",
            workflow_key="video-generate",
        )
        self.assertEqual(_infer_task_capability(entry, []), "video.generate")

    def test_prefers_provider_call_capability(self) -> None:
        entry = SimpleNamespace(
            capability="",
            workflow_key="image-generate",
        )
        provider = SimpleNamespace(capability="video.generate")
        self.assertEqual(_infer_task_capability(entry, [provider]), "video.generate")


if __name__ == "__main__":
    unittest.main()
