# Repository hygiene scan

Scanned on 2026-11-02 for the v1.0.0-rc.1 release candidate.

- 193 workspace text files: no drive-rooted paths, profile-home paths, or
  workspace username strings found.
- 122 PNGs: no matching PNG text chunks. Screenshots were captured
  from extension views and contain no visible filesystem paths.
- The raw-byte scan found one drive-separator byte sequence inside compressed
  PNG image data; it was not in a PNG text chunk and is not visible image text.
- The release ZIP was unpacked and scanned separately: 41 entries, no path
  matches, source maps, TypeScript, fixtures, `.env` files, test results, or
  Playwright reports.
- `git check-ignore` confirms `.output/`, `dist/`, `.wxt/`, `test-results/`,
  `transcripts/`, `*.transcript*`, and `codex-session-*.md` are ignored.

The ZIP SHA-256 remains
`c5656e5ca52a104c1ccc2ceb91c90b5ec1a11ef87687afaf2cbcd085b326d25c`.
