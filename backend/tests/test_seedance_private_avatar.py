import json
import unittest
from unittest.mock import patch

from app.core.config import ImageProviderProfile
from app.services.seedance_private_avatar import (
    SeedancePrivateAvatarError,
    get_private_avatar_asset,
    register_private_avatar_from_source,
    wait_private_avatar_active,
)


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class SeedancePrivateAvatarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = ImageProviderProfile(
            provider_name="seedance-2",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="seedance-2",
            timeout_seconds=30,
        )

    def test_register_creates_group_and_uploads_asset(self) -> None:
        responses = [
            _FakeResponse({"success": True, "data": {"group_id": "pg_01KGROUP"}}),
            _FakeResponse(
                {
                    "success": True,
                    "data": {
                        "asset_id": "pa_01KASSET",
                        "asset_url": "asset://pa_01KASSET",
                        "group_id": "pg_01KGROUP",
                        "status": "processing",
                    },
                }
            ),
        ]

        with patch(
            "app.services.seedance_private_avatar.resolve_public_media_url",
            return_value="https://cityusbdisk.cn/media/references/a.png",
        ):
            with patch(
                "app.services.seedance_private_avatar.urlopen",
                side_effect=responses,
            ) as mocked:
                result = register_private_avatar_from_source(
                    self.profile,
                    source_path="/media/references/a.png",
                    name="army-girl",
                    group_name="qmdh-test",
                )

        self.assertEqual(result["asset_id"], "pa_01KASSET")
        self.assertEqual(result["asset_url"], "asset://pa_01KASSET")
        self.assertEqual(result["status"], "processing")
        self.assertEqual(mocked.call_count, 2)
        upload_body = json.loads(mocked.call_args_list[1].args[0].data.decode("utf-8"))
        self.assertEqual(upload_body["group_id"], "pg_01KGROUP")
        self.assertEqual(upload_body["source_url"], "https://cityusbdisk.cn/media/references/a.png")
        self.assertEqual(upload_body["asset_type"], "image")

    def test_get_asset_status(self) -> None:
        with patch(
            "app.services.seedance_private_avatar.urlopen",
            return_value=_FakeResponse(
                {
                    "success": True,
                    "data": {
                        "asset_id": "pa_01KASSET",
                        "asset_url": "asset://pa_01KASSET",
                        "status": "active",
                    },
                }
            ),
        ):
            result = get_private_avatar_asset(self.profile, "pa_01KASSET")
        self.assertEqual(result["status"], "active")
        self.assertEqual(result["asset_url"], "asset://pa_01KASSET")

    def test_wait_failed_raises(self) -> None:
        with patch(
            "app.services.seedance_private_avatar.get_private_avatar_asset",
            return_value={
                "asset_id": "pa_x",
                "asset_url": "asset://pa_x",
                "status": "failed",
            },
        ):
            with self.assertRaisesRegex(SeedancePrivateAvatarError, "审核未通过"):
                wait_private_avatar_active(self.profile, "pa_x", timeout_seconds=1, poll_interval_seconds=0.01)

    def test_register_rejects_non_https(self) -> None:
        with patch(
            "app.services.seedance_private_avatar.resolve_public_media_url",
            return_value="http://insecure.example/a.png",
        ):
            with self.assertRaisesRegex(SeedancePrivateAvatarError, "HTTPS"):
                register_private_avatar_from_source(
                    self.profile,
                    source_path="/media/a.png",
                )

    def test_resolve_accepts_display_label(self) -> None:
        from unittest.mock import MagicMock

        from app.services import seedance_private_avatar as mod

        profile = ImageProviderProfile(
            provider_name="seedance-2",
            display_name="Seedance 2",
            api_key="k",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="seedance-2",
        )
        db = MagicMock()
        with patch.object(mod, "get_image_provider_profiles", return_value={"seedance-2": profile}):
            resolved = mod.resolve_seedance_image_provider_profile(
                db, provider_name="Seedance 2 Video"
            )
        self.assertEqual(resolved.provider_name, "seedance-2")


if __name__ == "__main__":
    unittest.main()
