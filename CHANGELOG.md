# Changelog

## v0.2.0 - 2026-06-08

### Added

- Added model activation toggles in admin model operations so an imported provider profile can be enabled or disabled without changing its pricing rules.
- Added QMDH branding across the app shell, login page, favicon, and browser title.
- Added formal release tracking for the current MVP 1.0 hardening wave.

### Changed

- Changed provider pricing rule defaults to `1,000,000` unit size and `USD` currency.
- Refined Studio template browsing into a constrained three-column picker with category navigation, denser template cards, and a right-side compare preview.
- Improved Studio history cards so generated images preserve full content with proportional scaling instead of horizontal cropping.
- Improved Studio composer behavior so it can collapse while browsing history and expand again on active interactions.
- Improved dashboard/account spend views and group spend reporting around the current operational usage ledger.

### Fixed

- Fixed Studio template hover preview stability when moving the pointer from the template list into the preview panel.
- Fixed excessive template-picker height and right-preview whitespace after the three-column template layout change.
- Fixed group-spend CSV export for Excel by emitting a UTF-8 BOM.
- Hid zero-cost currency noise in operational dashboard cards.

### Deployment Notes

- Product deployment baseline before this version-recording commit: `6ae35b1` (`feat(models): add model activation toggle`).
- Server direct GitHub fetch can still be unstable; the known-good fallback remains local `git bundle` upload and server-side fast-forward merge.
- No database migration was required for this release wave.
