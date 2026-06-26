import unittest

from app.routers.dashboard import USAGE_LOG_DEFAULT_ENTRY_TYPES, _usage_log_billable_entry_types


class UsageLogBillingTests(unittest.TestCase):
    def test_billable_entry_types_prefers_task_summary_when_enabled(self) -> None:
        allowed = list(USAGE_LOG_DEFAULT_ENTRY_TYPES)
        self.assertEqual(
            _usage_log_billable_entry_types(
                include_task_summary=True,
                entry_type=None,
                allowed_entry_types=allowed,
            ),
            ("task.finalized", "chat.message.completed"),
        )

    def test_billable_entry_types_uses_provider_calls_when_task_summary_disabled(self) -> None:
        allowed = [item for item in USAGE_LOG_DEFAULT_ENTRY_TYPES if item != "task.finalized"]
        self.assertEqual(
            _usage_log_billable_entry_types(
                include_task_summary=False,
                entry_type=None,
                allowed_entry_types=allowed,
            ),
            ("provider_call.recorded", "chat.message.completed"),
        )

    def test_billable_entry_types_respects_explicit_entry_type_filter(self) -> None:
        allowed = list(USAGE_LOG_DEFAULT_ENTRY_TYPES)
        self.assertEqual(
            _usage_log_billable_entry_types(
                include_task_summary=True,
                entry_type="provider_call.recorded",
                allowed_entry_types=allowed,
            ),
            ("provider_call.recorded",),
        )


if __name__ == "__main__":
    unittest.main()
