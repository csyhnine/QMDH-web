from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeUrlError(ValueError):
    pass


def _is_blocked_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_public_http_url(url: str) -> str:
    normalized = str(url or "").strip()
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("URL must start with http:// or https://")
    if not parsed.hostname:
        raise UnsafeUrlError("URL host is required")

    hostname = parsed.hostname.strip().rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise UnsafeUrlError("Localhost URLs are not allowed")

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        if _is_blocked_ip(hostname):
            raise UnsafeUrlError("Private or local network URLs are not allowed")
        return normalized

    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return normalized

    for address in {item[4][0] for item in addresses}:
        try:
            if _is_blocked_ip(address):
                raise UnsafeUrlError("Private or local network URLs are not allowed")
        except ValueError:
            continue
    return normalized
