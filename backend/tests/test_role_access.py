import unittest

from app.core.auth import (
    has_admin_access,
    has_backoffice_access,
    has_content_ops_access,
    has_ops_role,
    normalize_user_role,
    require_content_ops_access,
    require_ops_access,
    require_user_admin,
)
from app.core.config import AuthUserProfile


class RoleAccessTests(unittest.TestCase):
    def test_normalize_user_role(self) -> None:
        self.assertEqual(normalize_user_role("owner"), "admin")
        self.assertEqual(normalize_user_role("admin"), "admin")
        self.assertEqual(normalize_user_role("ops"), "ops")
        self.assertEqual(normalize_user_role("designer"), "designer")
        self.assertEqual(normalize_user_role(""), "designer")

    def test_role_capabilities(self) -> None:
        self.assertTrue(has_admin_access("admin"))
        self.assertFalse(has_admin_access("ops"))
        self.assertTrue(has_ops_role("ops"))
        self.assertTrue(has_backoffice_access("ops"))
        self.assertTrue(has_content_ops_access("ops"))
        self.assertFalse(has_backoffice_access("designer"))

    def test_require_user_admin_blocks_ops(self) -> None:
        ops_user = AuthUserProfile(name="ops", token="t", role="ops", project_codes=("*",))
        with self.assertRaises(Exception):
            require_user_admin(ops_user)

    def test_require_ops_access_blocks_ops(self) -> None:
        ops_user = AuthUserProfile(name="ops", token="t", role="ops", project_codes=("*",))
        with self.assertRaises(Exception):
            require_ops_access(ops_user)

    def test_require_content_ops_access_allows_ops(self) -> None:
        ops_user = AuthUserProfile(name="ops", token="t", role="ops", project_codes=("*",))
        require_content_ops_access(ops_user)


if __name__ == "__main__":
    unittest.main()
