"""Batch create employee accounts from company roster."""
import sys
sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models import User
from app.core.security import hash_password
from sqlalchemy import select

# (name, phone, title) -> (username=pinyin initials, password=last 4 digits of phone)
# Role mapping: 联席院长/负责人 -> admin, 所长/主任/项目负责人/副所长 -> ops, 设计师/行政/其他 -> designer
EMPLOYEES = [
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
]

# Pinyin initial mapping for each character in names
PINYIN_MAP = {
    "王": "w", "天": "t", "玺": "x", "蒋": "j", "峥": "z", "嵘": "r",
    "冯": "f", "爽": "s", "陈": "c", "亚": "y", "飞": "f", "桂": "g", "梅": "m",
    "李": "l", "薇": "w", "温": "w", "保": "b", "军": "j", "阳": "y", "潜": "q",
    "伟": "w", "明": "m", "恒": "h", "光": "g", "郑": "z", "国": "g", "梁": "l",
    "蔡": "c", "海": "h", "洋": "y", "邓": "d", "智": "z", "峰": "f",
    "振": "z", "宇": "y", "费": "f", "新": "x", "哲": "z", "杨": "y", "华": "h",
    "黎": "l", "文": "w", "淞": "s", "仲": "z", "福": "f", "肖": "x", "莉": "l",
    "关": "g", "家": "j", "宝": "b", "俊": "j", "树": "s", "廖": "l", "胜": "s",
    "齐": "q", "乐": "l", "彭": "p", "淑": "s", "章": "z", "吴": "w", "凤": "f",
    "辉": "h", "周": "z", "航": "h", "许": "x", "潇": "x", "崔": "c", "梦": "m",
    "月": "y", "张": "z", "凯": "k", "旖": "y", "甘": "g", "超": "c",
    "唐": "t", "梓": "z", "欣": "x", "茂": "m", "荣": "r", "曾": "z", "紫": "z",
    "馨": "x", "赖": "l", "威": "w", "曼": "m", "玲": "l", "厚": "h", "星": "x",
    "孙": "s", "晓": "x", "龙": "l", "程": "c", "立": "l", "黄": "h", "婕": "j",
    "少": "s", "良": "l", "林": "l", "昱": "y", "博": "b",
    "子": "z", "鹏": "p", "畅": "c", "袁": "y", "铭": "m", "崇": "c",
    "潘": "p", "理": "l", "球": "q", "郭": "g", "榕": "r",
    "翁": "w", "奕": "y", "豪": "h", "亿": "y", "昊": "h", "东": "d", "奇": "q",
    "邹": "z", "菲": "f", "炜": "w", "焜": "k", "邵": "s", "长": "c", "孝": "x",
    "鑫": "x",
}


def name_to_username(name: str) -> str:
    """Convert Chinese name to pinyin initials."""
    return "".join(PINYIN_MAP.get(ch, "") for ch in name)


def title_to_role(title: str) -> str:
    """Map job title to system role."""
    if "联席院长" in title or "负责人" in title:
        return "admin"
    if "所长" in title or "主任" in title or "项目负责人" in title or "副所长" in title:
        return "ops"
    return "designer"


def main():
    created = 0
    skipped = 0
    used_names: set[str] = set()
    with SessionLocal() as db:
        # Collect existing usernames
        existing = db.scalars(select(User.name)).all()
        used_names.update(existing)

        for name, phone, title in EMPLOYEES:
            username = name_to_username(name)
            if not username:
                print(f"  SKIP (no pinyin): {name}")
                skipped += 1
                continue

            # Handle duplicate usernames
            base_username = username
            suffix = 1
            while username in used_names:
                username = f"{base_username}{suffix}"
                suffix += 1
            used_names.add(username)

            password = phone[-4:]
            role = title_to_role(title)

            db.add(User(
                name=username,
                display_name=name,
                role=role,
                password_hash=hash_password(password),
                is_active=True,
                project_codes=["QMDH-001"],
                monthly_quota=200.0 if role == "designer" else None,
            ))
            created += 1
            print(f"  + {username} ({name}, {role}, pwd: {password})")

        db.commit()

    print(f"\nDone: {created} created, {skipped} skipped")


if __name__ == "__main__":
    main()
