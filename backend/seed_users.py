"""
Batch seed script: create user accounts from the staff roster.
Run from backend/ directory:
    python seed_users.py

Requires the database to be initialized (app must have been started at least once).
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

# Ensure app package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.security import hash_password
from app.database import SessionLocal, engine
from app.models import Base, User
from sqlalchemy import select

# ---------- Staff roster ----------
# (display_name, phone, title)
ROSTER = [
    ("王天", "18811242323", "联席院长"),
    ("王玺", "13910099651", "联席院长"),
    ("蒋峥嵘", "18898776353", "技术主任"),
    ("冯爽", "18145856022", "所长"),
    ("陈亚飞", "15910568051", "经营主任"),
    ("冯桂梅", "18675511321", "驻福田城管局"),
    ("李薇", "18618198180", "所长"),
    ("温保军", "15593879707", "设计师"),
    ("阳潜伟", "13316414260", "管理主任"),
    ("温保明", "13530715161", "所长"),
    ("李恒光", "13590389890", "设计师"),
    ("郑国梁", "18565882712", "所长"),
    ("蔡海洋", "13411886277", "副所长（所长待遇）"),
    ("邓智峰", "18588986889", "设计师"),
    ("王振宇", "13001769087", "设计师"),
    ("费新哲", "17765607103", "设计师"),
    ("杨华海", "13168059282", "行政专员"),
    ("黎文淞", "13558429011", "所长"),
    ("仲伟福", "13798331535", "常务主任"),
    ("肖莉", "18688710920", "设计师"),
    ("关家宝", "15999639777", "设计师"),
    ("王俊树", "15119401343", "设计师"),
    ("廖海胜", "18078203440", "设计师"),
    ("王海洋", "13355223210", "负责人"),
    ("齐乐", "18025379101", "设计师"),
    ("彭淑章", "13148729089", "行政助理"),
    ("吴凤辉", "15768360925", "设计师"),
    ("周宇航", "15645640737", "设计师"),
    ("许潇", "13049895417", "项目负责人"),
    ("崔梦月", "17854269263", "设计师"),
    ("张凯凯", "18565613287", "设计师"),
    ("邓旖", "18601692972", "品牌主管"),
    ("甘超", "13528819081", "项目负责人"),
    ("唐梓欣", "17335887523", "设计师"),
    ("王茂荣", "13249813965", "副所长"),
    ("曾紫馨", "13377112005", "设计师"),
    ("赖威", "15774070711", "设计师"),
    ("许曼玲", "13417438251", "综合行政主管"),
    ("黎厚星", "18721255801", "设计师"),
    ("孙晓龙", "13061510665", "设计师"),
    ("程立", "15566285921", "设计师"),
    ("黄婕", "17347182536", "驻南山城管局"),
    ("王少良", "13655312786", "设计师"),
    ("林昱", "15768656924", "设计师"),
    ("李胜晖", "15689456909", "设计师"),
    ("王博林", "13582018900", "设计师"),
    ("廖子鹏", "18818670155", "设计师"),
    ("黄畅", "15072112761", "项目负责人"),
    ("袁伟铭", "15820288725", "所长"),
    ("蔡华崇", "18244934528", "电气技术员"),
    ("潘理球", "15013516087", "设计师"),
    ("张欣", "15645209196", "设计师"),
    ("郭榕榕", "13959975336", "出纳兼行政"),
    ("翁奕豪", "18664520714", "设计师"),
    ("王亿昊", "15767979828", "设计师"),
    ("张伟", "15074795532", "所长"),
    ("张东奇", "18333247566", "设计师"),
    ("邹伟", "13714027113", "负责人（副所长级待遇）"),
    ("杨菲菲", "13430535164", "设计师"),
    ("梁炜焜", "18759953726", "设计师"),
    ("邵长孝", "15866608531", "设计师"),
    ("王海鑫", "15611636101", "设计师"),
    ("莫烨馨", "18025489643", "设计师"),
]

# ---------- Pinyin mapping (manually curated for this roster) ----------
PINYIN_MAP: dict[str, str] = {
    "王天": "wt",
    "王玺": "wx",
    "蒋峥嵘": "jzr",
    "冯爽": "fs",
    "陈亚飞": "cyf",
    "冯桂梅": "fgm",
    "李薇": "lw",
    "温保军": "wbj",
    "阳潜伟": "yqw",
    "温保明": "wbm",
    "李恒光": "lhg",
    "郑国梁": "zgl",
    "蔡海洋": "chy",
    "邓智峰": "dzf",
    "王振宇": "wzy",
    "费新哲": "fxz",
    "杨华海": "yhh",
    "黎文淞": "lws",
    "仲伟福": "zwf",
    "肖莉": "xl",
    "关家宝": "gjb",
    "王俊树": "wjs",
    "廖海胜": "lhs",
    "王海洋": "why",
    "齐乐": "ql",
    "彭淑章": "psz",
    "吴凤辉": "wfh",
    "周宇航": "zyh",
    "许潇": "xx",
    "崔梦月": "cmy",
    "张凯凯": "zkk",
    "邓旖": "dy",
    "甘超": "gc",
    "唐梓欣": "tzx",
    "王茂荣": "wmr",
    "曾紫馨": "zzx",
    "赖威": "law",
    "许曼玲": "xml",
    "黎厚星": "lhx",
    "孙晓龙": "sxl",
    "程立": "cl",
    "黄婕": "hj",
    "王少良": "wsl",
    "林昱": "ly",
    "李胜晖": "lsh",
    "王博林": "wbl",
    "廖子鹏": "lzp",
    "黄畅": "hc",
    "袁伟铭": "ywm",
    "蔡华崇": "chc",
    "潘理球": "plq",
    "张欣": "zx",
    "郭榕榕": "grr",
    "翁奕豪": "wyh",
    "王亿昊": "wyh2",
    "张伟": "zw",
    "张东奇": "zdq",
    "邹伟": "zow",
    "杨菲菲": "yff",
    "梁炜焜": "lwk",
    "邵长孝": "scx",
    "王海鑫": "whx",
    "莫烨馨": "myx",
}

# ---------- Role mapping ----------
ADMIN_TITLES = {"联席院长", "负责人"}
OPS_TITLES = {"所长", "副所长", "副所长（所长待遇）", "常务主任", "技术主任", "经营主任", "管理主任", "项目负责人", "负责人（副所长级待遇）"}


def get_role(title: str) -> str:
    if title in ADMIN_TITLES:
        return "admin"
    if title in OPS_TITLES:
        return "ops"
    return "designer"


@dataclass
class SeedUsersResult:
    created: int = 0
    skipped: int = 0


def seed_staff_users(
    session_factory=SessionLocal,
    *,
    engine_to_init=engine,
    stdout: Callable[[str], None] | None = print,
) -> SeedUsersResult:
    Base.metadata.create_all(bind=engine_to_init)
    db = session_factory()
    result = SeedUsersResult()

    try:
        for display_name, phone, title in ROSTER:
            username = PINYIN_MAP.get(display_name)
            if not username:
                if stdout:
                    stdout(f"  [SKIP] No pinyin mapping for {display_name}")
                result.skipped += 1
                continue

            existing = db.scalar(select(User).where(User.name == username))
            if existing:
                if not existing.display_name:
                    existing.display_name = display_name
                if not existing.project_codes:
                    existing.project_codes = ["*"] if existing.role in ("owner", "admin", "ops") else ["QMDH-001"]
                existing.is_active = True
                if stdout:
                    stdout(f"  [EXISTS] {username} ({display_name})")
                result.skipped += 1
                continue

            password = phone[-4:]
            role = get_role(title)

            user = User(
                name=username,
                display_name=display_name,
                role=role,
                password_hash=hash_password(password),
                is_active=True,
                project_codes=["*"] if role in ("admin", "ops") else ["QMDH-001"],
            )
            db.add(user)
            result.created += 1
            if stdout:
                stdout(f"  [CREATE] {username} / {display_name} / {role} / pw={password}")

        db.commit()
        if stdout:
            stdout(f"\nDone: {result.created} created, {result.skipped} skipped.")
        return result
    finally:
        db.close()


def main() -> None:
    seed_staff_users()


if __name__ == "__main__":
    main()
