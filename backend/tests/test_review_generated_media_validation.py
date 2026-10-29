"""R21: real validation/persistence boundaries and durable offline R20 recovery."""
import ast
from base64 import b64decode, b64encode
from datetime import datetime
from io import BytesIO
import mimetypes
from pathlib import Path
import struct
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request

from PIL import Image
from app.models import TaskStatus
from app.services.generated_media_validation import validate_generated_media
from tests.review_media_fixtures import MP4_BYTES, WEBM_BYTES, PNG_BYTES, PNG_BASE64, JPEG_BYTES
from tests.test_review_partial_image_progress import load, BACKEND
from tests.test_review_async_recovery import AsyncRecoveryTests
from tests.test_review_async_image_recovery import HaodeyaImageRecoveryTests
from tests.test_review_grok_bigjpg_recovery import SingleOutputRecoveryBase


class Response:
    def __init__(self, data, content_type): self.data=data; self.headers={"Content-Type": content_type}
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self): return self.data


class GeneratedMediaValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary=Path(self.enterContext(TemporaryDirectory(prefix="r21-offline-")))
        self.writes=[]; self.requests=[]; self.data=PNG_BYTES; self.content_type="image/png"
        serial=iter(range(1000,9999))
        ns={"__name__": __name__, "datetime": datetime, "randint": lambda *args: next(serial), "mimetypes": mimetypes,
            "urlparse": urlparse, "Path": Path, "Request": Request, "HTTPError": HTTPError, "URLError": URLError,
            "urlopen": self.http, "validate_generated_media": validate_generated_media,
            "write_binary_asset": self.write, "write_base64_asset": lambda path,data: self.write(path,b64decode(data)), "b64decode": b64decode,
            "_DOWNLOAD_USER_AGENT": "Go-http-client/1.1", "HAODEYA_VIDEO_ENDPOINT_PATH": "/videos"}
        dimensions=load("app/services/image_aspect_ratio.py", {"struct": struct}, functions=["_png_dimensions","_jpeg_dimensions","read_image_dimensions"])
        ns["read_image_dimensions"]=dimensions["read_image_dimensions"]
        self.video=load("app/services/provider_adapters/video_common.py", dict(ns), functions=["persist_generated_video","persist_generated_video_bytes","download_generated_video","extension_for_downloaded_video"])
        self.image=load("app/services/task_executor.py", dict(ns), functions=["_persist_generated_image","_download_generated_image","_extension_for_downloaded_image"])
        self.upscale=load("app/services/provider_adapters/bigjpg_upscale.py", {**ns,"_IMAGE_EXTENSIONS":frozenset({"png","jpg","jpeg","webp"})}, functions=["_download_upscaled_image","_extension_for_downloaded_image","_extension_from_image_bytes","_normalize_image_extension"])
        self.grok=load("app/services/provider_adapters/haodeya_grok_video.py", dict(ns), functions=["_download_haodeya_grok_video_content"])
        self.profile=SimpleNamespace(base_url="https://fixture.invalid", api_key="synthetic-unused", timeout_seconds=1)

    def http(self, request, **kwargs):
        self.requests.append(request.full_url)
        return Response(self.data,self.content_type)

    def write(self, path, data):
        target=(self.temporary/path).resolve(); self.assertTrue(target.is_relative_to(self.temporary.resolve()))
        target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data); self.writes.append(path); return path

    def case(self, kind):
        case=AsyncRecoveryTests("test_unknown_submit_result_never_posts_again") if kind=="video" else HaodeyaImageRecoveryTests("test_unknown_submit_without_receipt_is_never_posted_again") if kind=="image" else SingleOutputRecoveryBase("test_unknown_submit_result_never_posts_again")
        if kind in {"bigjpg","grok"}: case.kind=kind
        case.setUp(); self.addCleanup(case.doCleanups); return case

    def persist_video(self):
        return self.video["persist_generated_video"](provider_name="fixture",video_url="https://fixture.invalid/file.mp4",prompt="fixture",timeout_seconds=1,output_format="mp4")

    def persist_image(self, payload):
        return self.image["_persist_generated_image"](provider_name="fixture",image_payload=payload,prompt="fixture",timeout_seconds=1,output_format="png")

    def test_valid_raster_and_generic_mime_use_detected_extension(self):
        buffer=BytesIO(); Image.new("RGB",(1,1)).save(buffer,format="WEBP"); webp=buffer.getvalue()
        for data,declared,expected in [(PNG_BYTES,"image/png","png"),(JPEG_BYTES,"image/jpeg","jpeg"),(webp,"image/webp","webp"),(PNG_BYTES,"application/octet-stream","png"),(JPEG_BYTES,None,"jpeg")]:
            with self.subTest(mime=declared,extension=expected): self.assertEqual(validate_generated_media(data,kind="image",content_type=declared),expected)

    def test_image_empty_error_pages_wrong_mime_and_truncation_are_rejected(self):
        for data,mime in [(b"","image/png"),(b"<html>provider unavailable</html>","image/png"),(b'{"error":"quota"}',"application/octet-stream"),(PNG_BYTES[:24],"image/png"),(PNG_BYTES,"image/jpeg"),(PNG_BYTES,"text/html")]:
            with self.subTest(length=len(data),mime=mime):
                with self.assertRaises(ValueError): validate_generated_media(data,kind="image",content_type=mime)

    def test_valid_mp4_webm_and_generic_mime_use_actual_container(self):
        for data,mime,extension in [(MP4_BYTES,"video/mp4","mp4"),(MP4_BYTES,"application/octet-stream","mp4"),(WEBM_BYTES,"video/webm","webm"),(WEBM_BYTES,None,"webm")]:
            with self.subTest(mime=mime,extension=extension): self.assertEqual(validate_generated_media(data,kind="video",content_type=mime),extension)

    def test_video_empty_error_pages_wrong_mime_and_broken_containers_rejected(self):
        for data,mime in [(b"","video/mp4"),(b"<html>upstream error</html>","video/mp4"),(b'{"error":"failed"}',"application/octet-stream"),(b"fake-mp4","video/mp4"),(MP4_BYTES[:40],"video/mp4"),(WEBM_BYTES[:30],"video/webm"),(MP4_BYTES,"video/webm"),(MP4_BYTES,"text/html")]:
            with self.subTest(length=len(data),mime=mime):
                with self.assertRaises(ValueError): validate_generated_media(data,kind="video",content_type=mime)

    def test_shared_video_http_error_body_is_never_written_as_media(self):
        self.data=b"<html>HTTP 200 error page</html>"; self.content_type="text/html"
        with self.assertRaises(ValueError): self.persist_video()
        self.assertEqual(self.writes,[])
        self.data=MP4_BYTES; self.content_type="application/octet-stream"; path=self.persist_video()
        self.assertTrue(path.endswith(".mp4")); self.assertEqual((self.temporary/path).read_bytes(),MP4_BYTES)

    def test_video_bytes_entry_validates_and_ignores_misleading_output_format(self):
        args=dict(provider_name="fixture",prompt="fixture",output_format="html")
        with self.assertRaises(ValueError): self.video["persist_generated_video_bytes"](video_bytes=b"fake-video",**args)
        self.assertEqual(self.writes,[])
        path=self.video["persist_generated_video_bytes"](video_bytes=WEBM_BYTES,**args)
        self.assertTrue(path.endswith(".webm")); self.assertEqual((self.temporary/path).read_bytes(),WEBM_BYTES)

    def test_image_url_and_base64_validate_before_any_write(self):
        self.data=b'{"error":"not an image"}'; self.content_type="image/png"
        with self.assertRaises(ValueError): self.persist_image({"url":"https://fixture.invalid/file.png"})
        with self.assertRaises(ValueError): self.persist_image({"b64_json":b64encode(self.data).decode()})
        self.assertEqual(self.writes,[])
        self.data=JPEG_BYTES; self.content_type="application/octet-stream"; path,_=self.persist_image({"url":"https://fixture.invalid/wrong.png"})
        self.assertTrue(path.endswith(".jpeg")); self.assertEqual((self.temporary/path).read_bytes(),JPEG_BYTES)
        path,_=self.persist_image({"b64_json":PNG_BASE64}); self.assertTrue(path.endswith(".png"))

    def test_bigjpg_extension_requires_valid_bytes_instead_of_url_mime(self):
        fn=self.upscale["_extension_for_downloaded_image"]
        with self.assertRaises(ValueError): fn("https://fixture.invalid/p.png","image/png","png",b"not-image")
        self.assertEqual(fn("https://fixture.invalid/p.bin","application/octet-stream","png",PNG_BYTES),"png")
        self.assertEqual(fn("https://fixture.invalid/p.png","image/jpeg","png",JPEG_BYTES),"jpg")

    def test_grok_content_checks_http_mime_and_actual_video_bytes(self):
        fn=self.grok["_download_haodeya_grok_video_content"]
        self.data=b'{"error":"no content"}'; self.content_type="video/mp4"
        with self.assertRaises(ValueError): fn(self.profile,"accepted")
        self.data=MP4_BYTES; self.content_type="video/webm"
        with self.assertRaises(ValueError): fn(self.profile,"accepted")
        self.content_type="application/octet-stream"; self.assertEqual(fn(self.profile,"accepted"),MP4_BYTES)
        self.assertEqual(self.writes,[])

    def test_async_video_validation_failure_preserves_receipt_prior_cost_and_asset(self):
        case=self.case("video"); case.video_ns["persist_generated_video"]=self.video["persist_generated_video"]
        bad=True
        def http(request,**kwargs): return Response(b'{"error":"temporary"}' if bad and request.full_url.endswith("-b") else MP4_BYTES,"video/mp4")
        self.video["urlopen"]=http; case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.pending); self.assertEqual(state.result["upstream_task_id"],"accepted-unique")
        self.assertEqual(len(state.assets),1); self.assertEqual(state.cost,2); self.assertEqual(state.result["usage"],{"tokens":17})
        self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        bad=False; case.new_adapter(); case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.completed); self.assertEqual(len(state.assets),2)
        self.assertEqual(case.posts,["POST"]); self.assertEqual(len(case.gets),1)

    def test_async_image_validation_failure_preserves_prior_output_and_usage(self):
        case=self.case("image"); case.namespace["_persist_generated_image"]=self.image["_persist_generated_image"]
        bad=True
        def http(request,**kwargs): return Response(b"<html>bad output</html>" if bad and request.full_url.endswith("-2.png") else PNG_BYTES,"image/png")
        self.image["urlopen"]=http; case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.pending); self.assertEqual(len(state.assets),1); self.assertEqual(state.cost,2)
        self.assertEqual(state.result["upstream_task_id"],"accepted-1"); self.assertEqual(state.result["usage"],{"input_tokens":17})
        bad=False; case.make_adapter(); case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.completed); self.assertEqual(len(state.assets),2)
        self.assertEqual(case.submissions,[1]); self.assertEqual(len(case.requests),1)

    def test_bigjpg_invalid_body_is_review_and_retry_uses_original_task(self):
        case=self.case("bigjpg"); case.video_ns["_download_upscaled_image"]=self.upscale["_download_upscaled_image"]
        case.video_ns["_extension_for_downloaded_image"]=self.upscale["_extension_for_downloaded_image"]
        self.data=b"<html>not png</html>"; self.content_type="image/png"; case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.pending); self.assertEqual(state.assets,[])
        self.assertEqual(state.result["upstream_task_id"],"accepted-unique"); self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        self.data=PNG_BYTES; case.new_adapter(); case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.completed); self.assertEqual(len(state.assets),1)
        self.assertEqual(case.posts,["POST"]); self.assertEqual(len(case.gets),1)

    def test_grok_invalid_content_is_review_and_retry_keeps_content_task_id(self):
        case=self.case("grok"); case.video_ns["_download_haodeya_grok_video_content"]=self.grok["_download_haodeya_grok_video_content"]
        case.video_ns["persist_generated_video_bytes"]=self.video["persist_generated_video_bytes"]
        self.data=b'{"error":"content"}'; self.content_type="video/mp4"; case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.pending); self.assertEqual(state.assets,[])
        self.assertEqual(state.result["upstream_task_id"],"accepted-unique")
        self.data=MP4_BYTES; case.new_adapter(); case.execute(); state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.completed); self.assertEqual(len(state.assets),1)
        self.assertEqual(case.posts,["POST"]); self.assertEqual(len(case.gets),1)
        self.assertTrue(all(url.endswith("/accepted-unique/content") for url in self.requests))

    def test_http_transport_failures_remain_errors_without_storage(self):
        functions=[lambda:self.video["download_generated_video"]("https://fixture.invalid/v.mp4",timeout_seconds=1),
                   lambda:self.image["_download_generated_image"]("https://fixture.invalid/i.png",timeout_seconds=1),
                   lambda:self.upscale["_download_upscaled_image"]("https://fixture.invalid/u.png",timeout_seconds=1),
                   lambda:self.grok["_download_haodeya_grok_video_content"](self.profile,"accepted")]
        for namespace,fn in zip([self.video,self.image,self.upscale,self.grok],functions):
            for error in [URLError("synthetic offline"), HTTPError("https://fixture.invalid",503,"synthetic unavailable",{},BytesIO(b"provider offline"))]:
                namespace["urlopen"]=lambda *args,**kwargs:(_ for _ in ()).throw(error)
                with self.subTest(downloader=fn,error=type(error).__name__):
                    with self.assertRaisesRegex(ValueError,"download"): fn()
        self.assertEqual(self.writes,[])
