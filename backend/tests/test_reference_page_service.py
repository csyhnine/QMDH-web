"""Tests for reference page extraction service."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.services.reference_page_service import ReferencePageError, extract_reference_page


class ReferencePageServiceTests(unittest.TestCase):
    @patch("app.services.reference_page_service.httpx.Client")
    def test_extract_reference_page_collects_images(self, mock_client_cls) -> None:
        mock_response = MagicMock()
        mock_response.is_redirect = False
        mock_response.headers = {}
        mock_response.content = b"<html></html>"
        mock_response.text = """
        <html><head><title>Demo Tower</title>
        <meta property="og:image" content="https://cdn.example.com/cover.jpg" /></head>
        <body><img src="https://cdn.example.com/detail.jpg" width="800" height="600" /></body></html>
        """
        mock_response.raise_for_status.return_value = None

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        extracted = extract_reference_page("https://example.com/project/demo")
        self.assertEqual("Demo Tower", extracted.title)
        self.assertGreaterEqual(len(extracted.images), 2)

    def test_extract_reference_page_rejects_invalid_url(self) -> None:
        with self.assertRaises(ReferencePageError):
            extract_reference_page("ftp://bad.example.com/page")


if __name__ == "__main__":
    unittest.main()
