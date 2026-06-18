import unittest

from app.core.encryption import normalize_provider_api_key


class NormalizeProviderApiKeyTests(unittest.TestCase):
    def test_strips_x_api_key_prefix_without_space(self) -> None:
        self.assertEqual(
            normalize_provider_api_key("X-API-KEY:abcdef1234567890abcdef1234567890"),
            "abcdef1234567890abcdef1234567890",
        )

    def test_strips_x_api_key_prefix_with_space(self) -> None:
        self.assertEqual(
            normalize_provider_api_key("x-api-key: sk-test-secret"),
            "sk-test-secret",
        )

    def test_leaves_plain_key_unchanged(self) -> None:
        self.assertEqual(normalize_provider_api_key(" sk-test-secret "), "sk-test-secret")


if __name__ == "__main__":
    unittest.main()
