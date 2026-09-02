# Changelog

Notable changes per release. Versions before 0.10.0 were never tagged, so everything since
`v0.8.3` is collected under 0.10.0; the full commit history is in git.

## [0.10.0] - 2026-09-02

### Added

- Spell check toggle in the popup.
- Button in the popup demo that strips Vietnamese diacritics from the typed text.
- Toolbar icon now ships 16/24/32 sizes, so Chrome picks a crisp one per display density instead
  of scaling a single 19px image.
- `resource/render-icons.mjs` regenerates `src/icons/*.png` from `resource/avim.svg` on demand. The
  PNGs stay committed; the build never rasterises.
- Release workflow: pushing a `vX.Y.Z` tag builds the zip and publishes it as a GitHub Release
  asset, refusing to run if the tag disagrees with the manifest version.
- Browser smoke tests that load the extension in real Chromium and exercise the minified `build/`
  tree, not just `src/`.

### Changed

- Upgraded to Manifest V3: the background page is now a service worker.
- The Đ glyph is a real bold oblique letterform outlined from DejaVu Sans Bold Oblique. It was
  previously markup that *claimed* italic while exporting upright, because Inkscape had no italic
  face for the font it referenced.
- Each icon size carries its own optical glyph scale, so the letter stays legible at 16px without
  thickening the keycap at 128px.
- Replaced the gulp build with a dependency-light Node script, clearing 52 Dependabot alerts.
- Replaced jasmine with Node's built-in test runner; the suite is now 764 tests and needs no
  install to run.
- Modernised the extension, tests, and build to ES2020 syntax.

### Fixed

- Three word-boundary bugs uncovered while removing every `substr` call.
- Nine bugs uncovered while porting the test suite off jasmine.
- Read-only form fields are no longer transformed.

### Removed

- `icons/icon19.png`, which nothing referenced.
