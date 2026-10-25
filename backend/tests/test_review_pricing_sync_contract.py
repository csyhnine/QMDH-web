"""R34: explicitly scoped configuration sync, never real quotes or services."""
import argparse
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.models import ProviderProfile, ProviderPricingRule
from app.services import haodeya_pricing as pricing
from tests.test_review_agent_dispatch import load_functions


ENDPOINT = "https://newapi.haodeya.xyz/v1"
CATALOG = "haodeya-qmdh-2026-07-03"


class PricingSyncContractTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r34-offline-")))
        self.engine = create_engine("sqlite:///" + (self.root / "profiles.db").as_posix())
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        ProviderProfile.metadata.create_all(self.engine, tables=[ProviderProfile.__table__, ProviderPricingRule.__table__])
        self.sessions = sessionmaker(self.engine)
        self.serial = 0

    def seed(self, *, model="gemini-3.1-flash-image", endpoint=ENDPOINT, capability="image.generate", config=None, currency="USD", name=None, enabled=True):
        self.serial += 1
        with self.sessions() as db:
            row = ProviderProfile(provider_name=name or f"r34-{self.serial}", model_name=model, base_url=endpoint, api_key="synthetic-unused",
                                  adapter_kind="haodeya_grok" if capability == "video.generate" else "openai_compatible",
                                  capabilities=[capability], unit_price=9, pricing_currency=currency, pricing_unit="per_image", enabled=enabled,
                                  adapter_config=deepcopy(config or {"unit_price_1k": 9, "unit_price_2k": 18, "keep": "opaque"}))
            db.add(row)
            db.commit()
            return row.id

    def rule(self, profile_id, metric="custom_requests", *, capability="chat.completions", price=7, active=True):
        with self.sessions() as db:
            row = ProviderPricingRule(provider_profile_id=profile_id, capability=capability, metric=metric, unit_price=price, currency="USD", is_active=active)
            db.add(row)
            db.commit()
            return row.id

    def plan(self, *ids, edits=None):
        entries = []
        with self.sessions() as db:
            for profile_id in ids:
                row = db.get(ProviderProfile, profile_id)
                entry = {"profile_id": row.id, "provider": row.provider_name, "model": row.model_name,
                         "fingerprint": pricing.profile_pricing_fingerprint(db, row), "deactivate_rule_ids": []}
                if edits:
                    entry.update(edits.get(profile_id, {}))
                entries.append(entry)
        return {"version": 1, "catalog_id": CATALOG, "supplier": "haodeya", "currency": "CNY", "endpoint": ENDPOINT,
                "source": "synthetic operator-confirmed configuration contract; no real quote verified", "profiles": entries}

    def sync(self, plan=None, **kwargs):
        with self.sessions() as db:
            return pricing.sync_haodeya_pricing(db, confirmed_plan=plan, **kwargs)

    def snapshot(self):
        with self.sessions() as db:
            return {model.__tablename__: [{col.name: deepcopy(getattr(row, col.name)) for col in model.__table__.columns}
                                         for row in db.scalars(select(model).order_by(model.id))]
                    for model in (ProviderProfile, ProviderPricingRule)}

    def test_other_channel_nine_usd_image_is_not_modified_by_unscoped_apply(self):
        self.seed(endpoint="https://other-channel.invalid/v1")
        before = self.snapshot()
        with self.sessions() as db:
            try:
                pricing.sync_haodeya_pricing(db)
            except ValueError:
                pass
        self.assertEqual(self.snapshot(), before)

    def test_other_channel_chat_rules_and_custom_activation_are_preserved_by_unscoped_apply(self):
        profile_id = self.seed(model="openai/gpt-5.4", capability="chat.completions", endpoint="https://official.invalid/v1")
        self.rule(profile_id)
        self.rule(profile_id, "input_tokens")
        before = self.snapshot()
        with self.sessions() as db:
            try:
                pricing.sync_haodeya_pricing(db)
            except ValueError:
                pass
        self.assertEqual(self.snapshot(), before)

    def test_approved_plan_does_not_cross_channel_for_image_chat_or_any_video_family(self):
        cases = [("gemini-3.1-flash-image", "image.generate"), ("openai/gpt-5.4", "chat.completions"),
                 ("x-ai/grok-imagine-video-i2v", "video.generate"), ("happyhorse-1.1-i2v-5s", "video.generate"),
                 ("seedance-2-fast-720p-5s", "video.generate")]
        ids = [self.seed(model=model, capability=cap, endpoint="https://other-channel.invalid/v1") for model, cap in cases]
        rule_id = self.rule(ids[0])
        before = self.snapshot()
        result = self.sync(self.plan(*ids, edits={ids[0]: {"deactivate_rule_ids": [rule_id]}}))
        self.assertFalse(result.updated_profiles or result.updated_rules or result.deactivated_rules)
        self.assertTrue(all("endpoint" in row["reason"] for row in result.samples))
        self.assertEqual(self.snapshot(), before)

    def test_confirmed_image_chat_and_explicit_legacy_grok_contract_update_normally(self):
        image = self.seed()
        chat = self.seed(model="openai/gpt-5.4", capability="chat.completions")
        grok = self.seed(model="grok-imagine-video", capability="video.generate", name="haodeya_grok")
        plan = self.plan(image, chat, grok, edits={grok: {"video_family": "grok"}})
        before = self.snapshot()
        preview = self.sync(plan, dry_run=True)
        self.assertEqual(self.snapshot(), before)
        applied = self.sync(plan)
        self.assertEqual(preview.updated_profiles, applied.updated_profiles)
        with self.sessions() as db:
            self.assertEqual((db.get(ProviderProfile, image).unit_price, db.get(ProviderProfile, image).pricing_currency), (0.67, "CNY"))
            self.assertEqual(db.get(ProviderProfile, image).adapter_config["unit_price_2k"], 0.95)
            self.assertEqual(db.get(ProviderProfile, grok).unit_price, 3.33)
            rules = list(db.scalars(select(ProviderPricingRule).where(ProviderPricingRule.provider_profile_id == chat)))
            self.assertEqual(sorted((r.metric, r.unit_price, r.currency, r.is_active) for r in rules),
                             [("cached_input_tokens", 0, "CNY", True), ("input_tokens", 23.8, "CNY", True), ("output_tokens", 142.8, "CNY", True)])

    def test_exact_video_skus_use_their_actual_family_and_quality_without_adapter_guessing(self):
        cases = [("x-ai/grok-imagine-video-i2v-10s", 6.66, 3.33, 6.66), ("happyhorse-1.1-i2v-10s", 6.8, 3.4, 6.8),
                 ("seedance-2-fast-720p-10s", 11.2, 5.6, 11.2), ("seedance-2-1080p-10s", 35, 17.5, 35)]
        ids = [self.seed(model=model, capability="video.generate") for model, *_ in cases]
        self.sync(self.plan(*ids))
        with self.sessions() as db:
            for profile_id, (_, price, short, long) in zip(ids, cases, strict=True):
                row = db.get(ProviderProfile, profile_id)
                self.assertEqual((row.unit_price, row.pricing_unit, row.adapter_config["unit_price_1k"], row.adapter_config["unit_price_2k"]),
                                 (price, "per_video", short, long))

    def test_unknown_models_capabilities_and_free_suffix_do_not_enable_mutation_or_deactivation(self):
        ids = [self.seed(model="unconfirmed:free", capability="chat.completions"),
               self.seed(model="unknown-happyhorse-model", capability="video.generate", name="haodeya_happyhorse"),
               self.seed(model="gemini-3.1-flash-image", capability="video.generate"),
               self.seed(model="grok-imagine-video", capability="video.generate")]
        rule_id = self.rule(ids[1])
        before = self.snapshot()
        result = self.sync(self.plan(*ids, edits={ids[1]: {"deactivate_rule_ids": [rule_id]}}))
        self.assertFalse(result.updated_profiles or result.updated_rules or result.deactivated_rules)
        self.assertEqual(self.snapshot(), before)

    def test_custom_four_k_cny_is_preserved_and_foreign_tier_requires_explicit_quote(self):
        config = {"unit_price_1k": 9, "unit_price_2k": 18, "unit_price_4k": 9, "keep": {"source": "custom"}}
        cny = self.seed(config=config, currency="CNY")
        usd = self.seed(config=config)
        self.sync(self.plan(cny, usd))
        with self.sessions() as db:
            self.assertEqual(db.get(ProviderProfile, cny).adapter_config["unit_price_4k"], 9)
            self.assertEqual(db.get(ProviderProfile, usd).pricing_currency, "USD")
        quote = {"version": 1, "unit_price": 8, "currency": "CNY", "pricing_unit": "per_image", "source": "synthetic approved 4K supplement"}
        self.sync(self.plan(usd, edits={usd: {"image_4k_quote": quote}}))
        with self.sessions() as db:
            row = db.get(ProviderProfile, usd)
            self.assertEqual((row.pricing_currency, row.adapter_config["unit_price_4k"], row.adapter_config["keep"]), ("CNY", 8, {"source": "custom"}))
        self.sync(self.plan(usd, edits={usd: {"image_4k_quote": {**quote, "unit_price": 0}}}))
        with self.sessions() as db:
            self.assertEqual(db.get(ProviderProfile, usd).adapter_config["unit_price_4k"], 0)
        video = self.seed(model="x-ai/grok-imagine-video-i2v", capability="video.generate", config=config)
        extra = self.seed(config={**config, "unit_price_8k": 123})
        before = self.snapshot()
        self.sync(self.plan(video, extra))
        self.assertEqual(self.snapshot(), before)

    def test_custom_chat_rules_require_exact_explicit_deactivation_and_other_capabilities_stay(self):
        chat = self.seed(model="openai/gpt-5.4", capability="chat.completions")
        custom = self.rule(chat)
        other = self.rule(chat, capability="image.generate")
        self.sync(self.plan(chat))
        with self.sessions() as db:
            self.assertTrue(db.get(ProviderPricingRule, custom).is_active)
        result = self.sync(self.plan(chat, edits={chat: {"deactivate_rule_ids": [custom]}}))
        self.assertTrue(result.deactivated_rules)
        with self.sessions() as db:
            self.assertFalse(db.get(ProviderPricingRule, custom).is_active)
            self.assertTrue(db.get(ProviderPricingRule, other).is_active)
        image = self.seed()
        legacy = self.rule(image, "input_tokens")
        self.sync(self.plan(image, edits={image: {"deactivate_rule_ids": [legacy]}}))
        with self.sessions() as db:
            self.assertFalse(db.get(ProviderPricingRule, legacy).is_active)
        other_cap_rule = self.rule(chat, "input_tokens", capability="image.generate")
        with self.sessions() as db:
            standard_rule = db.scalar(select(ProviderPricingRule).where(ProviderPricingRule.provider_profile_id == chat,
                                                                      ProviderPricingRule.capability == "chat.completions",
                                                                      ProviderPricingRule.metric == "input_tokens")).id
        before = self.snapshot()
        for rule_id in (other_cap_rule, standard_rule):
            with self.subTest(rule_id=rule_id), self.assertRaises(ValueError):
                self.sync(self.plan(chat, edits={chat: {"deactivate_rule_ids": [rule_id]}}))
        self.assertEqual(self.snapshot(), before)

    def test_changed_channel_model_or_rule_fingerprint_aborts_before_any_batch_write(self):
        for field in ("base_url", "model_name", "rule", "deleted"):
            with self.subTest(field=field):
                first, second = self.seed(), self.seed()
                rule_id = self.rule(second)
                plan = self.plan(first, second)
                with self.sessions() as db:
                    if field == "rule":
                        db.get(ProviderPricingRule, rule_id).unit_price = 123
                    elif field == "deleted":
                        db.delete(db.get(ProviderProfile, second))
                    else:
                        setattr(db.get(ProviderProfile, second), field, "changed-after-approval")
                    db.commit()
                before = self.snapshot()
                with self.assertRaises(ValueError):
                    self.sync(plan)
                self.assertEqual(self.snapshot(), before)

    def test_dry_preview_is_no_autoflush_and_apply_requires_clean_session(self):
        profile_id = self.seed()
        before = self.snapshot()
        with self.sessions() as db:
            pending = ProviderProfile(provider_name="pending", api_key="unused", base_url=ENDPOINT, model_name="unconfirmed")
            db.add(pending)
            result = pricing.sync_haodeya_pricing(db, dry_run=True)
            self.assertIsNone(pending.id)
            self.assertEqual(result.samples[0]["reason"], "contract_required")
            self.assertEqual(len(result.samples[0]["fingerprint"]), 64)
        plan = self.plan(profile_id)
        with self.sessions() as db:
            db.get(ProviderProfile, profile_id)
            with self.assertRaises(ValueError):
                pricing.sync_haodeya_pricing(db, confirmed_plan=plan)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_contract_version_currency_source_quote_or_identity_is_rejected_without_writes(self):
        profile_id = self.seed()
        plan = self.plan(profile_id)
        before = self.snapshot()
        for change in ({"version": True}, {"version": 2}, {"supplier": "other"}, {"catalog_id": "unknown"}, {"currency": "USD"}, {"source": ""}, {"endpoint": ""}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.sync({**plan, **change})
        for price in (-1, True, float("nan"), float("inf")):
            quote = {"version": 1, "unit_price": price, "currency": "CNY", "pricing_unit": "per_image", "source": "synthetic"}
            with self.subTest(price=price), self.assertRaises(ValueError):
                self.sync(self.plan(profile_id, edits={profile_id: {"image_4k_quote": quote}}))
        self.assertEqual(self.snapshot(), before)

    def test_repeated_sync_uses_new_fingerprint_and_does_not_duplicate_or_report_false_updates(self):
        profile_id = self.seed(model="openai/gpt-5.4", capability="chat.completions")
        plan = self.plan(profile_id)
        self.sync(plan)
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.sync(plan)
        result = self.sync(self.plan(profile_id))
        self.assertFalse(result.updated_profiles or result.updated_rules or result.deactivated_rules)
        self.assertEqual(result.samples[0]["reason"], "unchanged")
        self.assertEqual(self.snapshot(), before)

    def test_apply_flush_and_commit_failure_roll_back_profile_rules_and_deactivation(self):
        image = self.seed()
        chat = self.seed(model="openai/gpt-5.4", capability="chat.completions")
        rule_id = self.rule(image)
        plan = self.plan(image, chat, edits={image: {"deactivate_rule_ids": [rule_id]}})
        before = self.snapshot()
        original = pricing._apply_sync_candidate
        for point in ("apply", "flush", "commit"):
            calls = 0
            def fail_second(*args, **kwargs):
                nonlocal calls
                calls += 1
                original(*args, **kwargs)
                if calls == 2:
                    raise RuntimeError("synthetic sync apply failure")
            with self.subTest(point=point), self.sessions() as db:
                target, attr = (pricing, "_apply_sync_candidate") if point == "apply" else (db, point)
                with patch.object(target, attr, side_effect=fail_second if point == "apply" else RuntimeError("synthetic transaction failure")):
                    with self.assertRaises(RuntimeError):
                        pricing.sync_haodeya_pricing(db, confirmed_plan=plan)
                self.assertFalse(db.in_transaction())
            self.assertEqual(self.snapshot(), before)

    def test_only_approved_profiles_and_owned_rule_ids_can_be_changed_without_enabling_profiles(self):
        approved = self.seed(enabled=False)
        other = self.seed()
        other_rule = self.rule(other)
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.sync(self.plan(approved, edits={approved: {"deactivate_rule_ids": [other_rule]}}))
        self.assertEqual(self.snapshot(), before)
        self.sync(self.plan(approved))
        after = self.snapshot()
        self.assertEqual(next(r for r in before["provider_profiles"] if r["id"] == other), next(r for r in after["provider_profiles"] if r["id"] == other))
        with self.sessions() as db:
            self.assertFalse(db.get(ProviderProfile, approved).enabled)

    def test_cli_requires_plan_before_database_and_supports_dry_run_without_startup(self):
        profile_id = self.seed()
        namespace = dict(Path=Path, json=json, argparse=argparse, SessionLocal=Mock(wraps=self.sessions), sync_haodeya_pricing=pricing.sync_haodeya_pricing)
        fn = load_functions("app/cli.py", ["_build_parser", "_run_pricing_sync_cli"], namespace)["_run_pricing_sync_cli"]
        with self.assertRaises(ValueError):
            fn(SimpleNamespace(dry_run=False, contract_plan=None))
        namespace["SessionLocal"].assert_not_called()
        path = self.root / "plan.json"
        path.write_text(json.dumps(self.plan(profile_id)), encoding="utf-8")
        before = self.snapshot()
        output = io.StringIO()
        with redirect_stdout(output):
            args = namespace["_build_parser"]().parse_args(["sync_haodeya_pricing", "--dry-run", "--contract-plan", str(path)])
            self.assertEqual(fn(args), 0)
        self.assertTrue(json.loads(output.getvalue())["dry_run"])
        self.assertEqual(self.snapshot(), before)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(fn(SimpleNamespace(dry_run=False, contract_plan=str(path))), 0)

    def test_duplicate_chat_rules_and_conflicting_catalog_four_k_quote_are_preserved(self):
        chat = self.seed(model="openai/gpt-5.4", capability="chat.completions")
        self.rule(chat, "input_tokens")
        self.rule(chat, "input_tokens", price=8)
        image = self.seed(model="wan2.7-image-pro")
        quote = {"version": 1, "unit_price": 9, "currency": "CNY", "pricing_unit": "per_image", "source": "conflicting synthetic quote"}
        before = self.snapshot()
        result = self.sync(self.plan(chat, image, edits={image: {"image_4k_quote": quote}}))
        self.assertFalse(result.updated_profiles or result.updated_rules or result.deactivated_rules)
        self.assertEqual(self.snapshot(), before)
