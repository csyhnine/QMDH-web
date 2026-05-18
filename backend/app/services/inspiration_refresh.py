from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models import InspirationPost
from app.services.inspiration_media import prepare_inspiration_image

SEED_INSPIRATION_IMAGES: dict[str, tuple[str, str]] = {
    "The Spiral - BIG": (
        "https://images.adsttc.com/media/images/6538/45a3/9875/1566/a119/2cf1/large_jpg/the-spiral-big_1.jpg",
        "https://www.archdaily.com/1008788/the-spiral-big",
    ),
    "Tree Art Museum - 澶ф湸寤虹瓚": (
        "https://images.adsttc.com/media/images/5170/a2b7/b3fc/4b20/1400/0012/large_jpg/0.jpg",
        "https://www.archdaily.com/362012/tree-art-museum-daipu-architects",
    ),
    "鏉ㄤ附钀嶈〃婕旇壓鏈腑蹇?- 鏈遍敨": (
        "https://images.adsttc.com/media/images/6127/989b/f91c/8159/1f00/0061/large_jpg/01.jpg",
        "https://www.archdaily.com/967481/yangliping-performing-arts-center-studio-zhu-pei",
    ),
    "鍜岀編鏈 - 瀹夎棨蹇犻泟": (
        "https://images.adsttc.com/media/images/609b/c580/c890/d701/642e/2746/large_jpg/new.jpg",
        "https://www.archdaily.com/961553/he-art-museum-tadao-ando",
    ),
    "Aman New York - Jean-Michel Gathy": (
        "https://images.adsttc.com/media/images/633a/b652/7120/027c/ea79/57ee/large_jpg/jean-michel-gathy-aman-new-york_1.jpg",
        "https://www.archdaily.com/989917/aman-new-york-jean-michel-gathy",
    ),
    "瀹夊緬鐢熷崥鐗╅ - 闅堢爺鍚?": (
        "https://images.adsttc.com/media/images/623c/8679/40c9/f001/65ef/d5d7/large_jpg/hcandersen-hus-museum-kengo-kuma-and-associates_1.jpg",
        "https://www.archdaily.com/979082/hcandersen-hus-museum-kengo-kuma-and-associates",
    ),
    "鍗″灏斿浗瀹跺崥鐗╅ - Jean Nouvel": (
        "https://images.adsttc.com/media/images/5c9c/cb15/284d/d1e4/1600/0026/large_jpg/1.jpg",
        "https://www.archdaily.com/913989/national-museum-of-qatar-atelier-jean-nouvel",
    ),
    "The Exchange - 闅堢爺鍚?": (
        "https://images.adsttc.com/media/images/604b/c37f/f91c/81c7/db00/0048/large_jpg/LMY_The_Exchange_0001.jpg",
        "https://www.archdaily.com/958498/the-exchange-kengo-kuma-and-associates",
    ),
    "娴︿笢缇庢湳棣?- Jean Nouvel": (
        "https://images.adsttc.com/media/images/6128/a9be/f91c/811f/3100/0039/large_jpg/%E6%B5%A6%E4%B8%9C%E7%BE%8E%E6%9C%AF%E9%A6%86.jpg",
        "https://www.archdaily.com/967555/atelier-jean-nouvels-museum-of-art-pudong-opens-to-the-public",
    ),
    "Serpentine Pavilion 2023 - Lina Ghotmeh": (
        "https://images.adsttc.com/media/images/62d5/4a53/06cd/f701/664c/f423/large_jpg/the-serpentine-pavilion-2023-lina-ghotmeh_1.jpg",
        "https://www.archdaily.com/985553/serpentine-pavilion-2023-lina-ghotmeh",
    ),
    "Chapel of Sound - OPEN寤虹瓚浜嬪姟鎵€": (
        "https://images.adsttc.com/media/images/61a8/3450/e4df/6101/69c8/6e0b/large_jpg/chapel-of-sound-open-architecture_5.jpg",
        "https://www.archdaily.com/972823/monolithic-concert-hall-open-architecture",
    ),
    "teamLab Borderless Jeddah": (
        "https://images.adsttc.com/media/images/61b8/6b04/f91c/81da/b400/0002/large_jpg/NHK_teamlab_borderless_jeddah_01.jpg",
        "https://www.archdaily.com/973553/teamlab-borderless-jeddah-teamlab",
    ),
    "瀵垮幙鏂囧寲鑹烘湳涓績 - 鏈遍敨": (
        "https://images.adsttc.com/media/images/5e55/0610/6ee6/7e4e/7800/025a/large_jpg/1.jpg",
        "https://www.archdaily.com/934401/shou-county-culture-and-art-center-studio-zhu-pei",
    ),
    "娣勫崥鍗庝鲸鍩庤壓鏈腑蹇?- 鏈遍敨": (
        "https://images.adsttc.com/media/images/637f/40f9/389f/3d03/e0a1/eb86/large_jpg/zibo-oct-art-center-studio-zhu-pei_5.jpg",
        "https://www.archdaily.com/992656/zibo-oct-art-center-studio-zhu-pei",
    ),
}


@dataclass
class RefreshSeedInspirationResult:
    matched: int = 0
    refreshed: int = 0
    skipped: int = 0


def refresh_seed_inspiration_media(
    session_factory: sessionmaker[Session],
    *,
    placeholders_only: bool = True,
) -> RefreshSeedInspirationResult:
    result = RefreshSeedInspirationResult()

    with session_factory() as db:
        posts = db.scalars(
            select(InspirationPost).where(InspirationPost.source_type == "external")
        ).all()

        for post in posts:
            seed = SEED_INSPIRATION_IMAGES.get(post.title)
            if not seed:
                result.skipped += 1
                continue

            result.matched += 1

            current_image_path = str(post.image_path or "")
            if placeholders_only and not current_image_path.lower().endswith(".svg"):
                result.skipped += 1
                continue

            image_url, source_url = seed
            post.image_path = prepare_inspiration_image(
                image_url,
                title=post.title,
                source_url=source_url,
                namespace="seed",
            )
            result.refreshed += 1

        db.commit()

    return result
