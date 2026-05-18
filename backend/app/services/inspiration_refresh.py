from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import asdict, dataclass
from html import unescape
from pathlib import Path
import re
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models import InspirationPost
from app.services.inspiration_media import prepare_inspiration_image
from app.services.media_storage import media_root_path


@dataclass(frozen=True)
class SeedInspirationEntry:
    title: str
    image_url: str
    source_url: str


SEED_INSPIRATION_ENTRIES: tuple[SeedInspirationEntry, ...] = (
    SeedInspirationEntry(
        title="The Spiral - BIG",
        image_url="https://images.adsttc.com/media/images/6538/45a1/ad61/4601/7c6d/96d4/medium_jpg/the-spiral-big_9.jpg?1698186675",
        source_url="https://www.archdaily.com/1008788/the-spiral-big",
    ),
    SeedInspirationEntry(
        title="Tree Art Museum - 大朴建筑",
        image_url="https://images.adsttc.com/media/images/5170/a2b7/b3fc/4b20/1400/0012/large_jpg/0.jpg",
        source_url="https://www.archdaily.com/362012/tree-art-museum-daipu-architects",
    ),
    SeedInspirationEntry(
        title="杨丽萍表演艺术中心 - 朱锫",
        image_url="https://images.adsttc.com/media/images/6127/974d/f91c/8194/5d00/0068/medium_jpg/03.jpg?1629984576",
        source_url="https://www.archdaily.com/967481/yangliping-performing-arts-center-studio-zhu-pei",
    ),
    SeedInspirationEntry(
        title="和美术馆 - 安藤忠雄",
        image_url="https://images.adsttc.com/media/images/609b/c580/c890/d701/642e/2746/large_jpg/new.jpg",
        source_url="https://www.archdaily.com/961553/he-art-museum-tadao-ando",
    ),
    SeedInspirationEntry(
        title="Aman New York - Jean-Michel Gathy",
        image_url="https://images.adsttc.com/media/images/633a/b652/7120/027c/ea79/57ee/medium_jpg/julius-cafe-naaw_1.jpg?1664792245",
        source_url="https://www.archdaily.com/989917/aman-new-york-jean-michel-gathy",
    ),
    SeedInspirationEntry(
        title="安徒生博物馆 - 隈研吾",
        image_url="https://images.adsttc.com/media/images/623c/8679/40c9/f001/65ef/d5d7/large_jpg/hcandersen-hus-museum-kengo-kuma-and-associates_1.jpg",
        source_url="https://www.archdaily.com/979082/hcandersen-hus-museum-kengo-kuma-and-associates",
    ),
    SeedInspirationEntry(
        title="卡塔尔国家博物馆 - Jean Nouvel",
        image_url="https://images.adsttc.com/media/images/5c9c/cb15/284d/d1e4/1600/0026/large_jpg/1.jpg",
        source_url="https://www.archdaily.com/913989/national-museum-of-qatar-atelier-jean-nouvel",
    ),
    SeedInspirationEntry(
        title="The Exchange - 隈研吾",
        image_url="https://images.adsttc.com/media/images/604b/c37f/f91c/81c7/db00/0048/large_jpg/LMY_The_Exchange_0001.jpg",
        source_url="https://www.archdaily.com/958498/the-exchange-kengo-kuma-and-associates",
    ),
    SeedInspirationEntry(
        title="浦东美术馆 - Jean Nouvel",
        image_url="https://images.adsttc.com/media/images/6128/a943/f91c/811e/f600/0032/medium_jpg/%C2%A9Chen_Hao_AJN_TJAD_TongjiAD_MAP_DSC4237.jpg?1630054610",
        source_url="https://www.archdaily.com/967555/atelier-jean-nouvels-museum-of-art-pudong-opens-to-the-public",
    ),
    SeedInspirationEntry(
        title="Serpentine Pavilion 2023 - Lina Ghotmeh",
        image_url="https://images.adsttc.com/media/images/62d5/4a53/06cd/f701/664c/f423/large_jpg/the-serpentine-pavilion-2023-lina-ghotmeh_1.jpg",
        source_url="https://www.archdaily.com/985553/serpentine-pavilion-2023-lina-ghotmeh",
    ),
    SeedInspirationEntry(
        title="Chapel of Sound - OPEN建筑事务所",
        image_url="https://images.adsttc.com/media/images/61a8/3450/e4df/6101/69c8/6e0b/medium_jpg/chapel-of-sound-photo-by-jonathan-leijonhufvud.jpg?1638413396",
        source_url="https://www.archdaily.com/972823/monolithic-concert-hall-open-architecture",
    ),
    SeedInspirationEntry(
        title="teamLab Borderless Jeddah",
        image_url="https://images.adsttc.com/media/images/61b8/6b04/f91c/81da/b400/0002/large_jpg/NHK_teamlab_borderless_jeddah_01.jpg",
        source_url="https://www.archdaily.com/973553/teamlab-borderless-jeddah-teamlab",
    ),
    SeedInspirationEntry(
        title="寿县文化艺术中心 - 朱锫",
        image_url="https://images.adsttc.com/media/images/5e55/0610/6ee6/7e4e/7800/025a/large_jpg/1.jpg",
        source_url="https://www.archdaily.com/934401/shou-county-culture-and-art-center-studio-zhu-pei",
    ),
    SeedInspirationEntry(
        title="淄博华侨城艺术中心 - 朱锫",
        image_url="https://images.adsttc.com/media/images/637f/40f9/389f/3d03/e0a1/eb86/large_jpg/zibo-oct-art-center-studio-zhu-pei_5.jpg",
        source_url="https://www.archdaily.com/992656/zibo-oct-art-center-studio-zhu-pei",
    ),
)


def _normalize_key(value: str) -> str:
    return value.strip().rstrip("/").lower()


SEED_INSPIRATION_BY_SOURCE_URL: dict[str, SeedInspirationEntry] = {
    _normalize_key(entry.source_url): entry for entry in SEED_INSPIRATION_ENTRIES
}
SEED_INSPIRATION_BY_TITLE: dict[str, SeedInspirationEntry] = {
    _normalize_key(entry.title): entry for entry in SEED_INSPIRATION_ENTRIES
}
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
_META_IMAGE_PATTERNS = (
    re.compile(r"<meta[^>]+property=['\"]og:image['\"][^>]+content=['\"]([^'\"]+)['\"]", re.IGNORECASE),
    re.compile(r"<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+property=['\"]og:image['\"]", re.IGNORECASE),
    re.compile(r"<meta[^>]+name=['\"]thumbnail['\"][^>]+content=['\"]([^'\"]+)['\"]", re.IGNORECASE),
    re.compile(r"<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+name=['\"]thumbnail['\"]", re.IGNORECASE),
)
_PAGE_IMAGE_PATTERN = re.compile(r"https://images\.adsttc\.com[^\"'\s<>]+", re.IGNORECASE)


@dataclass
class RefreshSeedInspirationResult:
    matched: int = 0
    refreshed: int = 0
    skipped: int = 0
    placeholders: int = 0
    restored: int = 0


@dataclass
class SeedBundleEntry:
    title: str
    source_url: str
    image_url: str
    image_path: str
    placeholder: bool


@dataclass
class BuildSeedBundleResult:
    bundle_path: str
    total: int = 0
    restored: int = 0
    placeholders: int = 0


@dataclass
class ImportSeedBundleResult:
    bundle_path: str
    extracted_files: int = 0
    matched: int = 0
    updated: int = 0
    skipped: int = 0


def _seed_entry_for_post(post: InspirationPost) -> SeedInspirationEntry | None:
    if post.source_url:
        by_source = SEED_INSPIRATION_BY_SOURCE_URL.get(_normalize_key(str(post.source_url)))
        if by_source:
            return by_source
    if post.title:
        return SEED_INSPIRATION_BY_TITLE.get(_normalize_key(str(post.title)))
    return None


def _discover_seed_image_url(entry: SeedInspirationEntry) -> str:
    request = Request(
        entry.source_url,
        headers={"User-Agent": _BROWSER_UA, "Referer": entry.source_url},
    )
    with urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", errors="ignore")

    candidates: list[str] = []
    seen: set[str] = set()

    for url in _PAGE_IMAGE_PATTERN.findall(html):
        normalized = unescape(url.strip())
        key = _normalize_key(normalized)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(normalized)

    def candidate_score(url: str) -> tuple[int, int]:
        lowered = url.lower()
        if "/medium_jpg/" in lowered:
            return (0, len(url))
        if "/large_jpg/" in lowered:
            return (1, len(url))
        if "/thumb_jpg/" in lowered:
            return (2, len(url))
        if "/newsletter/" in lowered:
            return (3, len(url))
        return (4, len(url))

    if candidates:
        candidates.sort(key=candidate_score)
        return candidates[0]

    for pattern in _META_IMAGE_PATTERNS:
        match = pattern.search(html)
        if match:
            return unescape(match.group(1).strip())
    return entry.image_url


def _preferred_seed_image_url(entry: SeedInspirationEntry) -> str:
    try:
        discovered = _discover_seed_image_url(entry)
        return discovered or entry.image_url
    except Exception:
        return entry.image_url


def refresh_seed_inspiration_media(
    session_factory: sessionmaker[Session],
    *,
    placeholders_only: bool = True,
) -> RefreshSeedInspirationResult:
    result = RefreshSeedInspirationResult()

    with session_factory() as db:
        posts = db.scalars(select(InspirationPost).where(InspirationPost.source_type == "external")).all()

        for post in posts:
            seed = _seed_entry_for_post(post)
            if not seed:
                result.skipped += 1
                continue

            result.matched += 1
            current_image_path = str(post.image_path or "")
            if placeholders_only and not current_image_path.lower().endswith(".svg"):
                result.skipped += 1
                continue

            image_url = _preferred_seed_image_url(seed)
            next_path = prepare_inspiration_image(
                image_url,
                title=post.title or seed.title,
                source_url=seed.source_url,
                namespace="seed",
                overwrite=True,
            )
            post.image_path = next_path
            result.refreshed += 1
            if next_path.lower().endswith(".svg"):
                result.placeholders += 1
            else:
                result.restored += 1

        db.commit()

    return result


def build_seed_inspiration_bundle(output_path: str) -> BuildSeedBundleResult:
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    media_root = media_root_path()
    staging_dir = destination.parent / f"{destination.stem}__bundle"
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries: list[SeedBundleEntry] = []
    result = BuildSeedBundleResult(bundle_path=str(destination))

    try:
        for entry in SEED_INSPIRATION_ENTRIES:
            image_url = _preferred_seed_image_url(entry)
            relative_path = prepare_inspiration_image(
                image_url,
                title=entry.title,
                source_url=entry.source_url,
                namespace="seed",
                overwrite=True,
            )
            source_file = (media_root / Path(relative_path)).resolve()
            target_file = staging_dir / Path(relative_path)
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, target_file)

            is_placeholder = relative_path.lower().endswith(".svg")
            manifest_entries.append(
                SeedBundleEntry(
                    title=entry.title,
                    source_url=entry.source_url,
                    image_url=image_url,
                    image_path=relative_path,
                    placeholder=is_placeholder,
                )
            )
            result.total += 1
            if is_placeholder:
                result.placeholders += 1
            else:
                result.restored += 1

        manifest_path = staging_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps({"entries": [asdict(entry) for entry in manifest_entries]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for path in staging_dir.rglob("*"):
                if path.is_file():
                    bundle.write(path, arcname=path.relative_to(staging_dir).as_posix())
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir)

    return result


def import_seed_inspiration_bundle(
    session_factory: sessionmaker[Session],
    *,
    bundle_path: str,
) -> ImportSeedBundleResult:
    source_bundle = Path(bundle_path).expanduser().resolve()
    if not source_bundle.exists() or not source_bundle.is_file():
        raise FileNotFoundError(f"Seed inspiration bundle not found: {source_bundle}")

    media_root = media_root_path()
    result = ImportSeedBundleResult(bundle_path=str(source_bundle))

    with zipfile.ZipFile(source_bundle) as bundle:
        members = [member for member in bundle.namelist() if member and not member.endswith("/")]
        for member in members:
            if member == "manifest.json":
                continue
            target = (media_root / Path(member)).resolve()
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(member) as source, target.open("wb") as sink:
                shutil.copyfileobj(source, sink)
            result.extracted_files += 1

        with bundle.open("manifest.json") as source:
            payload = json.load(source)

    manifest_entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(manifest_entries, list):
        raise ValueError("Seed inspiration bundle manifest is invalid")

    by_source: dict[str, SeedBundleEntry] = {}
    by_title: dict[str, SeedBundleEntry] = {}
    for item in manifest_entries:
        entry = SeedBundleEntry(
            title=str(item.get("title") or ""),
            source_url=str(item.get("source_url") or ""),
            image_url=str(item.get("image_url") or ""),
            image_path=str(item.get("image_path") or ""),
            placeholder=bool(item.get("placeholder", False)),
        )
        if entry.source_url:
            by_source[_normalize_key(entry.source_url)] = entry
        if entry.title:
            by_title[_normalize_key(entry.title)] = entry

    with session_factory() as db:
        posts = db.scalars(select(InspirationPost).where(InspirationPost.source_type == "external")).all()
        for post in posts:
            entry = None
            if post.source_url:
                entry = by_source.get(_normalize_key(str(post.source_url)))
            if entry is None and post.title:
                entry = by_title.get(_normalize_key(str(post.title)))

            if entry is None:
                result.skipped += 1
                continue

            result.matched += 1
            if entry.placeholder:
                result.skipped += 1
                continue

            post.image_path = entry.image_path
            result.updated += 1

        db.commit()

    return result
