#!/usr/bin/env python3
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# ensure backend imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.core.config import ImageProviderProfile
from app.services import seedance_real_avatar as mod


class RealAvatarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = ImageProviderProfile(
            provider_name="seedance-2",
            api_key="k",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="seedance-2",
        )

    def test_start_verify_returns_h5(self) -> None:
        with patch.object(
            mod,
            "create_real_avatar_verify_task",
            return_value={"task_id": "tsk_1", "status": "completed", "callback_url": "https://x/c"},
        ):
            with patch.object(
                mod,
                "get_real_avatar_verify_task",
                return_value={
                    "task_id": "tsk_1",
                    "status": "completed",
                    "h5_link": "https://h5.example/verify",
                    "byted_token": "tok",
                    "expires_at": 1,
                },
            ):
                out = mod.start_real_avatar_verification(self.profile, biz_id="u1")
        self.assertEqual(out["task_id"], "tsk_1")
        self.assertEqual(out["h5_link"], "https://h5.example/verify")

    def test_complete_register_uploads_after_verified(self) -> None:
        with patch.object(mod, "load_verify_callback", return_value={"result_code": "10000"}):
            with patch.object(
                mod,
                "get_real_avatar_verify_result",
                return_value={
                    "task_id": "tsk_1",
                    "verify_status": "verified",
                    "group_id": "grp_1",
                    "result_code": "10000",
                    "byted_token": "",
                },
            ):
                with patch.object(
                    mod,
                    "resolve_public_media_url",
                    return_value="https://cdn.example/a.png",
                ):
                    with patch.object(
                        mod,
                        "upload_real_avatar_asset",
                        return_value={
                            "asset_id": "ra_1",
                            "asset_url": "asset://ra_1",
                            "group_id": "grp_1",
                            "status": "processing",
                            "source_url": "https://cdn.example/a.png",
                        },
                    ) as upload:
                        out = mod.complete_real_avatar_registration(
                            self.profile,
                            task_id="tsk_1",
                            source_path="/media/a.png",
                        )
        upload.assert_called_once()
        self.assertEqual(out["asset_id"], "ra_1")


if __name__ == "__main__":
    unittest.main()
