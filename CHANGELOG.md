# Changelog

Notable changes per release. `0.8.5` and `0.9.0` exist in git but were never tagged, so everything
since `v0.8.3` is collected under 0.10.0.

## [0.10.1] - 2026-09-02

### Fixed

- Four ungrammatical strings in the English popup: "Select an options:", "Small tips:" next to a
  single tip, "You can turn on/off AVIM by press Ctrl twice.", and a singular "Remove accent" on a
  button that removes all of them. The Vietnamese strings were already correct.

### Development

- `resource/store/make-screenshots.mjs` renders the Chrome Web Store screenshots by driving the
  packed extension in real Chromium and typing Telex, then asserting the engine produced the
  expected Vietnamese, so a shot cannot ship showing raw keystrokes.

## [0.10.0] - 2026-09-02

First tagged release since `v0.8.3`, covering roughly eleven years of commits.

### Added

- Spell check toggle in the popup.
- Popup button that strips Vietnamese diacritics from the demo text.
- Toolbar icon in 16/24/32, so Chrome picks per display density instead of scaling one 19px image.

### Changed

- **Upgraded to Manifest V3.** Chrome no longer accepts MV2, so this is required to stay
  installable. Preferences moved to `chrome.storage`, and the background page became a service
  worker.
- Reworked the icon artwork: the Đ is now a real bold oblique letterform, and each size carries its
  own glyph scale so the letter stays legible at 16px.

### Fixed

- Three word-boundary rules read the end of the word instead of the character before the caret, so
  they misfired when typing into the middle of a word: the `q`+`u` rule, the breve (`ă`) shift, and
  the `ươ` pair check.
- Uppercasing `ậ` produced the wrong letter — it was missing from the uppercase mapping.
- Read-only form fields are no longer transformed (#15).
- Typing is no longer skipped in several input surfaces that the new test suite exercised, covering
  the auto method, caret and selection handling, and `contenteditable`.

### Removed

- A leftover "AVIM Demo" context menu item that popped up an `alert("demo")` on selected text.
- A broken tracking image in the README.

### Development

Not user-visible, but this is where most of the commits went:

- Replaced the gulp build with a dependency-light Node script, clearing 52 Dependabot alerts, and
  applied five earlier dependency bumps.
- Replaced jasmine with Node's built-in test runner. The suite is now 764 tests and runs with no
  install; porting it is what surfaced most of the fixes above.
- Added CI, plus browser smoke tests that load the extension in real Chromium and exercise the
  minified `build/` output rather than only `src/`.
- Modernised the extension, tests, and build to ES2020 syntax, and removed dead code left over from
  the Firefox port.
- Icons are generated from `resource/avim.svg` by `resource/render-icons.mjs`; the PNGs stay
  committed and the build never rasterises.
- Pushing a `vX.Y.Z` tag now builds the zip and publishes it as a release asset, with notes taken
  from this file.
