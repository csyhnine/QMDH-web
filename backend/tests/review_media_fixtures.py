"""Small static fixtures; no transport, application startup or video encoder."""
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from PIL import Image

_FIXTURES = Path(__file__).parent / "fixtures" / "review_media"
MP4_BYTES = (_FIXTURES / "single-frame.mp4").read_bytes()
WEBM_BYTES = (_FIXTURES / "single-frame.webm").read_bytes()
PNG_BYTES = (_FIXTURES / "pixel.png").read_bytes()
PNG_BASE64 = b64encode(PNG_BYTES).decode("ascii")
_buffer = BytesIO()
with Image.open(BytesIO(PNG_BYTES)) as _image:
    _image.convert("RGB").save(_buffer, format="JPEG", quality=75)
JPEG_BYTES = _buffer.getvalue()
