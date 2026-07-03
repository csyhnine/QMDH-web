"""Fetch public reference pages and extract candidate images (crawl-001 C1)."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urljoin

import httpx

from app.services.url_safety import UnsafeUrlError, assert_public_http_url

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
_MAX_EXTRACT_HTML_BYTES = 2 * 1024 * 1024
_MAX_EXTRACT_REDIRECTS = 5


@dataclass(frozen=True)
class ReferencePageExtract:
    source_url: str
    title: str
    images: tuple[str, ...]


class ReferencePageError(Exception):
    pass


def extract_reference_page(url: str, *, image_limit: int = 50) -> ReferencePageExtract:
    try:
        cleaned_url = assert_public_http_url(url)
    except UnsafeUrlError as exc:
        raise ReferencePageError(str(exc)) from exc

    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise ReferencePageError("beautifulsoup4 not installed") from exc

    current_url = cleaned_url
    try:
        with httpx.Client(timeout=15.0, follow_redirects=False, headers={"User-Agent": _BROWSER_UA}) as client:
            resp = None
            for _ in range(_MAX_EXTRACT_REDIRECTS + 1):
                resp = client.get(current_url)
                if not resp.is_redirect:
                    break
                location = resp.headers.get("location")
                if not location:
                    raise ReferencePageError("页面跳转缺少目标地址")
                try:
                    current_url = assert_public_http_url(urljoin(current_url, location))
                except UnsafeUrlError as exc:
                    raise ReferencePageError(str(exc)) from exc
            else:
                raise ReferencePageError("页面跳转次数过多")
            assert resp is not None
            resp.raise_for_status()
            content_length = int(resp.headers.get("content-length") or 0)
            if content_length > _MAX_EXTRACT_HTML_BYTES or len(resp.content) > _MAX_EXTRACT_HTML_BYTES:
                raise ReferencePageError("页面内容过大，无法提取图片")
            html = resp.text
    except ReferencePageError:
        raise
    except httpx.TimeoutException as exc:
        raise ReferencePageError("请求超时，无法访问该链接") from exc
    except httpx.HTTPStatusError as exc:
        raise ReferencePageError(f"页面返回错误: {exc.response.status_code}") from exc
    except Exception as exc:
        raise ReferencePageError("无法访问该链接") from exc

    soup = BeautifulSoup(html, "html.parser")
    title_tag = soup.find("title")
    page_title = title_tag.get_text(strip=True) if title_tag else ""

    images: list[str] = []
    seen: set[str] = set()

    for meta in soup.find_all("meta", attrs={"property": "og:image"}):
        content = (meta.get("content") or "").strip()
        if content and content not in seen:
            images.append(urljoin(current_url, content))
            seen.add(content)

    for img in soup.find_all("img"):
        width = img.get("width", "")
        height = img.get("height", "")
        try:
            if width and int(str(width).replace("px", "")) < 100:
                continue
            if height and int(str(height).replace("px", "")) < 100:
                continue
        except (ValueError, TypeError):
            pass

        src = (img.get("data-src") or img.get("data-original") or img.get("src") or "").strip()
        if not src or src.startswith("data:"):
            continue
        abs_url = urljoin(current_url, src)
        if abs_url not in seen:
            images.append(abs_url)
            seen.add(abs_url)

    capped = max(1, min(image_limit, 50))
    return ReferencePageExtract(
        source_url=current_url,
        title=page_title,
        images=tuple(images[:capped]),
    )
