# PR #164 Playwright compatibility

## Plan / DoD / verify

PR #164 has no linked story. Update Playwright to a release supporting the CI runner's Ubuntu 26.04, preserve the Rust dependency updates, and verify dependency installation, typecheck, lint, tests and Playwright test discovery. Browser execution and screenshot comparison must pass in Linux CI before merging.

## Investigation (2026-11-10)

- Unsupported runner OS: confirmed. Both `artifact-sandbox` and `ui-screenshot-diff` fail during browser installation with `Playwright does not support chromium on ubuntu26.04-x64`, using Playwright 1.58.2.
- Rust dependency regression: low confidence. The CLI build succeeds; neither failing job reaches test execution, and the PR only changes Cargo.lock.
- Transient download failure: ruled out by the explicit unsupported-platform error in both jobs. Retrying the same versions would not address the cause.

Playwright added Ubuntu 26.04 support in 1.61. Update to the published stable 1.65.0 and regenerate the web lockfile. The existing CI installation step installs the matching Chromium and system dependencies. Keep the runner and screenshot assertions unchanged.

## Sources

- [Failed browser installation](https://github.com/shwld/tatsumaki/actions/runs/42549338961/job/128941184150)
- [Playwright 1.61 release notes](https://playwright.dev/docs/release-notes#version-161)
- [Playwright update instructions](https://playwright.dev/docs/intro#updating-playwright)

## Verification

Root dependency installation, typecheck, lint, package formatting, documentation links, client build and test discovery for both Playwright configurations pass with 1.65.0 (65 screenshot tests and 15 sandbox tests). Workers tests pass 862/862, setup tests 45/45 and component tests 496/496. An overlapping component run reported one failure; the subsequent component run passed all 496 tests. Linux browser execution and screenshot comparison remain pending CI.
