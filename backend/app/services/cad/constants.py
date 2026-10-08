"""CAD extract constants and user-facing guidance."""

TIANZHENG_UPLOAD_NOTE = (
    "天正、中望等第三方 CAD 图纸请先在原软件中「转 T3 / 炸开墙体」后再上传，"
    "否则自定义墙门窗对象可能无法解析为标准线要素。"
)

DWG_CONVERTER_NOTE = (
    "DWG 需经服务端转换为 DXF 后再解析；若未配置转换器，请另存为 DXF 后重试。"
)

SUPPORTED_SOURCE_EXTENSIONS = frozenset({"dxf", "dwg"})

GEOMETRY_ENTITY_TYPES = frozenset({"LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "SPLINE", "HATCH"})
TEXT_ENTITY_TYPES = frozenset({"TEXT", "MTEXT"})

LAYER_ROLE_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("wall", ("wall", "walls", "墙", "qiang", "wall-line")),
    ("door", ("door", "doors", "门", "men", "door-win")),
    ("window", ("window", "windows", "窗", "chuang")),
    ("column", ("column", "columns", "柱", "zhu", "pillar")),
    ("dimension", ("dim", "dimension", "标注", "尺寸")),
    ("axis", ("axis", "轴", "grid", "轴网")),
    ("hatch", ("hatch", "填充", "pattern")),
    ("border", ("border", "frame", "图框", "title")),
    ("room_label", ("text", "room", "name", "房间", "pub_text", "label")),
)
