import asyncio
import json
import unittest
from unittest.mock import patch

from app.services.chat_service import ChatProviderConfig, stream_chat_completion


class _FakeStreamResponse:
    def __init__(self, status_code: int, *, lines: list[str] | None = None, body: bytes | None = None):
        self.status_code = status_code
        self._lines = lines or []
        self._body = body or b""

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def aread(self) -> bytes:
        return self._body

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class _FakeAsyncClient:
    def __init__(self, responses: list[_FakeStreamResponse], payloads: list[dict]):
        self._responses = responses
        self._payloads = payloads

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def stream(self, method: str, url: str, *, json: dict, headers: dict):
        del method, url, headers
        self._payloads.append(json)
        return self._responses.pop(0)


class ChatServiceUsageTests(unittest.TestCase):
    def _collect_chunks(self, provider: ChatProviderConfig, messages: list[dict], responses: list[_FakeStreamResponse]):
        payloads: list[dict] = []

        async def run():
            with patch("app.services.chat_service.decrypt_value_or_raise", return_value="plain-key"):
                with patch(
                    "app.services.chat_service.httpx.AsyncClient",
                    return_value=_FakeAsyncClient(responses, payloads),
                ):
                    return [chunk async for chunk in stream_chat_completion(provider, messages)]

        chunks = asyncio.run(run())
        return chunks, payloads

    def test_stream_chat_completion_emits_usage_payload_when_available(self) -> None:
        provider = ChatProviderConfig(
            api_key="encrypted",
            base_url="https://example.test/v1",
            model_name="glm-5",
        )
        responses = [
            _FakeStreamResponse(
                200,
                lines=[
                    f"data: {json.dumps({'usage': {'prompt_tokens': 15, 'completion_tokens': 9, 'total_tokens': 24}})}",
                    f"data: {json.dumps({'choices': [{'delta': {'content': '你好'}}]})}",
                    "data: [DONE]",
                ],
            )
        ]

        chunks, payloads = self._collect_chunks(provider, [{"role": "user", "content": "hello"}], responses)

        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]["stream_options"], {"include_usage": True})
        self.assertTrue(any('"usage": {"prompt_tokens": 15, "completion_tokens": 9, "total_tokens": 24}' in chunk for chunk in chunks))
        self.assertTrue(any('"delta": "\\u4f60\\u597d"' in chunk for chunk in chunks))
        self.assertEqual(chunks[-1], "data: [DONE]\n\n")

    def test_stream_chat_completion_retries_without_usage_when_upstream_rejects_stream_options(self) -> None:
        provider = ChatProviderConfig(
            api_key="encrypted",
            base_url="https://example.test/v1",
            model_name="glm-5",
        )
        responses = [
            _FakeStreamResponse(
                400,
                body=json.dumps({"error": {"message": "unknown parameter: stream_options.include_usage"}}).encode("utf-8"),
            ),
            _FakeStreamResponse(
                200,
                lines=[
                    f"data: {json.dumps({'choices': [{'delta': {'content': 'fallback ok'}}]})}",
                    "data: [DONE]",
                ],
            ),
        ]

        chunks, payloads = self._collect_chunks(provider, [{"role": "user", "content": "hello"}], responses)

        self.assertEqual(len(payloads), 2)
        self.assertIn("stream_options", payloads[0])
        self.assertNotIn("stream_options", payloads[1])
        self.assertTrue(any('"delta": "fallback ok"' in chunk for chunk in chunks))
        self.assertEqual(chunks[-1], "data: [DONE]\n\n")


if __name__ == "__main__":
    unittest.main()
