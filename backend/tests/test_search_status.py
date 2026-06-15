import unittest
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.integrations.search.service import check_meilisearch_health, get_search_engine_name


class SearchStatusTests(unittest.TestCase):
    def test_get_search_engine_name_defaults_to_postgres(self) -> None:
        with patch.object(settings, "meilisearch_enabled", False):
            self.assertEqual(get_search_engine_name(), "postgres")

    def test_get_search_engine_name_when_meilisearch_enabled(self) -> None:
        with patch.object(settings, "meilisearch_enabled", True):
            self.assertEqual(get_search_engine_name(), "meilisearch")

    def test_check_meilisearch_health_when_disabled(self) -> None:
        with patch.object(settings, "meilisearch_enabled", False):
            reachable, status = check_meilisearch_health()
        self.assertFalse(reachable)
        self.assertEqual(status, "disabled")

    @patch("app.integrations.search.service._meili_client")
    def test_check_meilisearch_health_when_available(self, mock_client_factory) -> None:
        client = MagicMock()
        client.health.return_value = {"status": "available"}
        mock_client_factory.return_value = client

        with patch.object(settings, "meilisearch_enabled", True):
            reachable, status = check_meilisearch_health()

        self.assertTrue(reachable)
        self.assertEqual(status, "available")


if __name__ == "__main__":
    unittest.main()
