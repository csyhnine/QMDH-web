"""Validate generated media bytes before storage; no transport or storage I/O."""
from io import BytesIO

from PIL import Image


_GENERIC_MIMES = {"", "application/octet-stream", "binary/octet-stream", "application/binary", "application/x-binary"}
_MIMES = {
    "png": {"image/png", "image/x-png"}, "jpeg": {"image/jpeg", "image/jpg", "image/pjpeg"},
    "webp": {"image/webp"}, "gif": {"image/gif"}, "bmp": {"image/bmp", "image/x-bmp", "image/x-ms-bmp"},
    "tiff": {"image/tiff", "image/x-tiff"},
    "mp4": {"video/mp4", "application/mp4", "video/x-m4v"}, "mov": {"video/quicktime"},
    "webm": {"video/webm", "video/x-matroska"},
}


def _boxes(data):
    position = 0
    while position < len(data):
        if len(data)-position < 8:
            raise ValueError("Truncated media box")
        size = int.from_bytes(data[position:position+4], "big")
        kind = bytes(data[position+4:position+8])
        header = 8
        if size == 1:
            if len(data)-position < 16:
                raise ValueError("Truncated extended media box")
            size = int.from_bytes(data[position+8:position+16], "big")
            header = 16
        elif size == 0:
            size = len(data)-position
        if size < header or position+size > len(data):
            raise ValueError("Invalid media box size")
        yield kind, data[position+header:position+size]
        position += size


def _child(data, name):
    return next((payload for kind, payload in _boxes(data) if kind == name), None)


def _mp4_extension(data):
    top = list(_boxes(data))
    movie = next((payload for kind, payload in top if kind == b"moov"), None)
    if movie is None or not any(kind == b"mdat" and len(payload) for kind, payload in top):
        raise ValueError("Missing movie metadata or media payload")
    video = False
    for kind, track in _boxes(movie):
        if kind != b"trak":
            continue
        media = _child(track, b"mdia")
        if media is None:
            continue
        handler = _child(media, b"hdlr")
        info = _child(media, b"minf")
        if handler is None or len(handler) < 12 or bytes(handler[8:12]) != b"vide" or info is None:
            continue
        table = _child(info, b"stbl")
        description = _child(table, b"stsd") if table is not None else None
        if description is None or len(description) < 8:
            continue
        entries = list(_boxes(description[8:]))
        if len(entries) != int.from_bytes(description[4:8], "big"):
            raise ValueError("Invalid video sample descriptions")
        for _, entry in entries:
            if len(entry) >= 78 and int.from_bytes(entry[24:26], "big") and int.from_bytes(entry[26:28], "big"):
                video = True
    if not video:
        raise ValueError("Missing video track")
    file_type = next((payload for kind, payload in top if kind == b"ftyp"), None)
    if file_type is not None and (len(file_type) < 8 or len(file_type) % 4):
        raise ValueError("Invalid media file type box")
    return "mov" if file_type is None or bytes(file_type[:4]) == b"qt  " else "mp4"


def _vint(data, position, *, identifier=False):
    if position >= len(data) or not data[position]:
        raise ValueError("Invalid EBML integer")
    width = 1
    mask = 0x80
    while not data[position] & mask:
        width += 1
        mask >>= 1
    if width > (4 if identifier else 8) or position+width > len(data):
        raise ValueError("Truncated EBML integer")
    value = int.from_bytes(data[position:position+width], "big")
    if not identifier:
        value &= (1 << (7*width))-1
        if value == (1 << (7*width))-1:
            value = None
    return value, position+width


def _elements(data):
    position = 0
    while position < len(data):
        name, position = _vint(data, position, identifier=True)
        size, position = _vint(data, position)
        end = len(data) if size is None else position+size
        if end > len(data):
            raise ValueError("Truncated EBML element")
        yield name, data[position:end]
        position = end


def _webm_extension(data):
    top = list(_elements(data))
    header = next((payload for name, payload in top if name == 0x1A45DFA3), None)
    segment = next((payload for name, payload in top if name == 0x18538067), None)
    if header is None or segment is None or not any(name == 0x4282 and bytes(payload) == b"webm" for name, payload in _elements(header)):
        raise ValueError("Missing WebM header")
    children = list(_elements(segment))
    tracks = next((payload for name, payload in children if name == 0x1654AE6B), None)
    numbers = set()
    for name, entry in _elements(tracks if tracks is not None else b""):
        if name != 0xAE:
            continue
        values = dict(_elements(entry))
        if int.from_bytes(values.get(0x83, b""), "big") != 1 or bytes(values.get(0x86, b"")) not in {b"V_VP8", b"V_VP9", b"V_AV1"}:
            continue
        dimensions = dict(_elements(values.get(0xE0, b"")))
        if int.from_bytes(dimensions.get(0xB0, b""), "big") and int.from_bytes(dimensions.get(0xBA, b""), "big"):
            numbers.add(int.from_bytes(values.get(0xD7, b""), "big"))
    for name, cluster in children:
        if name != 0x1F43B675:
            continue
        for name, payload in _elements(cluster):
            blocks = [payload] if name == 0xA3 else [value for key, value in _elements(payload) if key == 0xA1] if name == 0xA0 else []
            for block in blocks:
                track, offset = _vint(block, 0)
                if track in numbers and len(block) > offset+3:
                    return "webm"
    raise ValueError("Missing WebM video sample")


def validate_generated_media(data, *, kind, content_type=None):
    """Return an extension derived from verified bytes, never a URL suffix.

    Video verification checks container, video-track and sample-block structure;
    it does not decode frames or assert end-to-end playback correctness.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)) or not data:
        raise ValueError("Generated media response is empty or is not binary")
    if kind == "image":
        try:
            with Image.open(BytesIO(data)) as image:
                extension = {"PNG": "png", "JPEG": "jpeg", "WEBP": "webp", "GIF": "gif", "BMP": "bmp", "TIFF": "tiff"}.get(image.format)
                if extension is None or not image.width or not image.height:
                    raise ValueError("Unsupported raster format")
                image.verify()
            with Image.open(BytesIO(data)) as image:
                image.load()
        except Exception as exc:
            raise ValueError("Generated image is not a supported complete raster image") from exc
    elif kind == "video":
        view = memoryview(data)
        try:
            extension = _webm_extension(view) if bytes(view[:4]) == b"\x1aE\xdf\xa3" else _mp4_extension(view)
        except (ValueError, OverflowError, IndexError) as exc:
            raise ValueError("Generated video is not a supported complete container") from exc
    else:
        raise ValueError("Unsupported generated media kind")
    declared = str(content_type or "").split(";", 1)[0].strip().lower()
    if declared not in _GENERIC_MIMES and declared not in _MIMES[extension]:
        raise ValueError("Generated media MIME does not match its verified format")
    return extension
