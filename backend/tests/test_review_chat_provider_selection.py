"""R85-A/B: isolate the real resolvers and query a real in-memory provider table."""
import ast
from pathlib import Path
import unittest

from sqlalchemy import create_engine, delete, event, select
from sqlalchemy.orm import Session

from app.models import PlatformSettings, ProviderProfile


SOURCE = Path(__file__).resolve().parents[1] / "app/integrations/studio_agent/agent.py"
CHAT = ["chat.completions"]
IMAGE = ["image.generate"]


def load_resolver():
    # Do not import the agent's tools, policy, secret decoding or LLM clients.
    # Compile the current original function and original error class unchanged.
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
    selected = [node for node in tree.body if (
        isinstance(node, ast.ClassDef) and node.name == "StudioAgentUnavailableError"
    ) or (isinstance(node, ast.FunctionDef) and node.name == "_resolve_provider")]
    if len(selected) != 2:
        raise AssertionError("R85 resolver or error class is missing")
    namespace = {
        "__name__": "r85_studio_resolver_under_test", "Session": Session,
        "ProviderProfile": ProviderProfile, "select": select,
    }
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), "exec"), namespace)
    return namespace["_resolve_provider"], namespace["StudioAgentUnavailableError"]


class StudioProviderSelectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        ProviderProfile.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.db.close)
        self.resolve_provider, self.unavailable = load_resolver()

    def set_rows(self, rows):
        self.db.execute(delete(ProviderProfile))
        self.db.commit()
        self.db.add_all([
            ProviderProfile(
                id=identifier, provider_name=f"r85-synthetic-{identifier}",
                api_key="synthetic-unused-key", base_url="https://provider.invalid/v1",
                model_name="synthetic-model", enabled=enabled, capabilities=capabilities,
            )
            for identifier, capabilities, enabled in rows
        ])
        self.db.commit()

    def test_default_finds_chat_after_image_video_and_empty_capabilities(self):
        self.set_rows([
            (50, CHAT, True), (20, ["video.generate"], True),
            (10, IMAGE, True), (40, None, True), (30, [], True),
        ])
        self.assertEqual(self.resolve_provider(self.db, None).id, 50)
        self.assertEqual(len(self.db.scalars(select(ProviderProfile)).all()), 5)

    def test_default_uses_first_enabled_chat_in_id_order(self):
        cases = (
            ("chat-first", [(30, CHAT, True), (10, CHAT, True), (20, IMAGE, True)], 10),
            ("disabled-chat-first", [(1, CHAT, False), (2, IMAGE, True), (3, CHAT, True)], 3),
            ("disabled-image-first", [(1, IMAGE, False), (2, CHAT, True)], 2),
        )
        for name, rows, expected in cases:
            with self.subTest(case=name):
                self.set_rows(rows)
                self.assertEqual(self.resolve_provider(self.db, None).id, expected)

    def test_explicit_enabled_chat_takes_priority(self):
        self.set_rows([(10, CHAT, True), (50, ["image.generate", "chat.completions"], True)])
        self.assertEqual(self.resolve_provider(self.db, 50).id, 50)
        self.assertEqual(self.resolve_provider(self.db, None).id, 10)

    def test_unusable_explicit_id_preserves_chat_fallback(self):
        self.set_rows([(10, IMAGE, True), (20, CHAT, False), (25, [], True), (26, None, True), (30, CHAT, True)])
        for identifier in (999, 10, 20, 25, 26):
            with self.subTest(provider_id=identifier):
                self.assertEqual(self.resolve_provider(self.db, identifier).id, 30)

    def test_no_eligible_chat_preserves_unavailable_error(self):
        for rows in ([], [(1, IMAGE, True)], [(1, CHAT, False)], [(1, [], True)], [(1, None, True)]):
            with self.subTest(rows=rows):
                self.set_rows(rows)
                for identifier in (None, 999):
                    with self.assertRaisesRegex(self.unavailable, r"^No enabled chat provider is available for Studio agent\.$"):
                        self.resolve_provider(self.db, identifier)

    def test_selection_only_reads_real_provider_rows(self):
        self.set_rows([(10, IMAGE, True), (20, CHAT, True)])
        statement = select(ProviderProfile.id, ProviderProfile.enabled, ProviderProfile.capabilities).order_by(ProviderProfile.id)
        before = self.db.execute(statement).all()
        statements = []

        def record(connection, cursor, sql, parameters, context, executemany):
            statements.append(sql)

        event.listen(self.engine, "before_cursor_execute", record)
        try:
            self.assertEqual(self.resolve_provider(self.db, None).id, 20)
            self.db.flush()
            self.assertEqual(self.db.execute(statement).all(), before)
        finally:
            event.remove(self.engine, "before_cursor_execute", record)
        self.assertTrue(statements)
        self.assertTrue(all(sql.lstrip().upper().startswith("SELECT") for sql in statements))


POLISH_SOURCE = Path(__file__).resolve().parents[1] / "app/services/prompt_polish_service.py"


def load_polish_resolver():
    tree = ast.parse(POLISH_SOURCE.read_text(encoding="utf-8"), filename=str(POLISH_SOURCE))
    selected = [node for node in tree.body if (
        isinstance(node, ast.ClassDef) and node.name == "PromptPolishUnavailableError"
    ) or (isinstance(node, ast.FunctionDef) and node.name == "resolve_prompt_polish_provider")]
    if len(selected) != 2:
        raise AssertionError("R85 polish resolver or error class is missing")
    namespace = {
        "__name__": "r85_polish_resolver_under_test", "Session": Session,
        "PlatformSettings": PlatformSettings, "ProviderProfile": ProviderProfile, "select": select,
    }
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(POLISH_SOURCE), "exec"), namespace)
    return namespace["resolve_prompt_polish_provider"], namespace["PromptPolishUnavailableError"]


class PromptPolishProviderSelectionTests(unittest.TestCase):
    set_rows = StudioProviderSelectionTests.set_rows

    def setUp(self):
        self.engine = create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        ProviderProfile.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.db.close)
        self.resolve_polish, self.unavailable = load_polish_resolver()

    def test_polish_default_finds_chat_after_non_chat_and_empty_capabilities(self):
        self.set_rows([(50, CHAT, True), (20, ["video.generate"], True), (10, IMAGE, True), (40, None, True), (30, [], True)])
        settings = PlatformSettings(prompt_polish_provider_id=None)
        self.assertEqual(self.resolve_polish(self.db, settings).id, 50)

    def test_polish_default_respects_enabled_and_id_order(self):
        cases = (
            ("chat-first", [(30, CHAT, True), (10, CHAT, True), (20, IMAGE, True)], 10),
            ("disabled-chat-first", [(1, CHAT, False), (2, IMAGE, True), (3, CHAT, True)], 3),
            ("disabled-image-first", [(1, IMAGE, False), (2, CHAT, True)], 2),
        )
        for name, rows, expected in cases:
            with self.subTest(case=name):
                self.set_rows(rows)
                self.assertEqual(self.resolve_polish(self.db, PlatformSettings(prompt_polish_provider_id=None)).id, expected)

    def test_polish_explicit_enabled_chat_takes_priority(self):
        self.set_rows([(10, CHAT, True), (50, ["image.generate", "chat.completions"], True)])
        settings = PlatformSettings(prompt_polish_provider_id=50)
        self.assertEqual(self.resolve_polish(self.db, settings).id, 50)
        self.assertEqual(settings.prompt_polish_provider_id, 50)

    def test_polish_unusable_explicit_id_keeps_rejection_instead_of_fallback(self):
        self.set_rows([(10, IMAGE, True), (20, CHAT, False), (25, [], True), (26, None, True), (30, CHAT, True)])
        for identifier in (999, 10, 20, 25, 26):
            with self.subTest(provider_id=identifier):
                settings = PlatformSettings(prompt_polish_provider_id=identifier)
                with self.assertRaisesRegex(self.unavailable, "^配置的提示词润色模型不可用，请联系管理员。$"):
                    self.resolve_polish(self.db, settings)
                self.assertEqual(settings.prompt_polish_provider_id, identifier)
        self.assertEqual(self.resolve_polish(self.db, PlatformSettings(prompt_polish_provider_id=None)).id, 30)

    def test_polish_no_default_chat_keeps_missing_model_error(self):
        for rows in ([], [(1, IMAGE, True)], [(1, CHAT, False)], [(1, [], True)], [(1, None, True)]):
            with self.subTest(rows=rows):
                self.set_rows(rows)
                with self.assertRaisesRegex(self.unavailable, "^未配置提示词润色模型，请联系管理员。$"):
                    self.resolve_polish(self.db, PlatformSettings(prompt_polish_provider_id=None))

    def test_polish_selection_only_reads_provider_rows(self):
        self.set_rows([(10, IMAGE, True), (20, CHAT, True)])
        statement = select(ProviderProfile.id, ProviderProfile.enabled, ProviderProfile.capabilities).order_by(ProviderProfile.id)
        before = self.db.execute(statement).all()
        statements = []

        def record(connection, cursor, sql, parameters, context, executemany):
            statements.append(sql)

        event.listen(self.engine, "before_cursor_execute", record)
        settings = PlatformSettings(prompt_polish_provider_id=None)
        try:
            self.assertEqual(self.resolve_polish(self.db, settings).id, 20)
            self.db.flush()
            self.assertEqual(self.db.execute(statement).all(), before)
            self.assertIsNone(settings.prompt_polish_provider_id)
        finally:
            event.remove(self.engine, "before_cursor_execute", record)
        self.assertTrue(statements)
        self.assertTrue(all(sql.lstrip().upper().startswith("SELECT") for sql in statements))
