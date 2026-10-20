# Deploy and release

Read this before releasing `certainty-scan` or moving the repository.
Facts checked on 2026-10-20 unless marked "chưa kiểm" (not verified).

## Repo

| | |
| --- | --- |
| Current location | `github.com/naucodehq/certainty-scan` (public) |
| Previous location | `github.com/2ngnhan/certainty-scan` (GitHub redirects it) |
| Status | Transferred to `naucodehq` on 20/10/2026 (đã chuyển 20/10/2026) |
| Default branch | `main` |

## Deploy targets

Nothing here is a server. "Deploying" means publishing one of these:

| Target | What | How it gets there |
| --- | --- | --- |
| npm package `certainty-scan` | The CLI (`npx certainty-scan`) | Manual `npm publish` by the package maintainer (npm user `2ngnhan`). No CI publishes. |
| Zenodo record | Archived release, DOI `10.5281/zenodo.22026189`, concept DOI `10.5281/zenodo.22026188` (all versions) | A GitHub **release** on this repo fires the Zenodo webhook, Zenodo archives the tag and mints a new version DOI under the concept DOI. Metadata comes from `CITATION.cff`. |
| Docs site `certainty.naucode.io` | Landing and docs | NOT this repo: it is GitHub Pages of `2ngnhan/certainty-audit`. |

State on 2026-10-20: npm has `0.5.0` and `0.5.1`; the latest GitHub release and tag is `v0.5.1`. `package.json` and `CITATION.cff` already say `0.6.0`, which is not yet published to npm or released on GitHub.

## How a deploy happens

- Push or PR to `main`: `.github/workflows/ci.yml` runs `npm ci && npm test` on Node 18, 20 and 22. Nothing is published.
- A release is three manual steps, in this order:
  1. Bump `version` in `package.json`, and `version` plus `date-released` in `CITATION.cff`. Commit, push, wait for CI green.
  2. `npm publish` from a clean checkout of that commit.
  3. `git tag vX.Y.Z && git push origin vX.Y.Z`, then `gh release create vX.Y.Z -R naucodehq/certainty-scan`. The release (not the tag alone) triggers Zenodo.

## Manual deploy

```bash
npm ci
npm test                         # must pass
npm pack --dry-run               # check the file list (src, examples, LICENSE, NOTICE, README.md)
npm publish                      # needs `npm login` as a maintainer of the package
git tag v0.6.0 && git push origin v0.6.0
gh release create v0.6.0 -R naucodehq/certainty-scan --notes "..."
```

## Verify

- `npm view certainty-scan version` shows the new version; `npx certainty-scan@<version> --help` runs.
- `npm view certainty-scan repository.url` points at `naucodehq/certainty-scan` (only after the first publish made after 20/10/2026; the published 0.5.1 metadata still says `2ngnhan`).
- Zenodo: a new version appears under concept DOI `10.5281/zenodo.22026188` a few minutes after the release.
- CI badge for `main` is green.

## Rollback

- npm: you cannot overwrite a version. Publish a fixed patch version, and `npm deprecate certainty-scan@<bad> "<reason>"`. `npm unpublish` only works within 72 hours and breaks anyone pinned to it; avoid.
- Zenodo: a DOI is permanent. Publish a corrected release; do not try to delete the record.
- GitHub release: `gh release delete vX.Y.Z` removes the release page, not the Zenodo record.
- Never change a published DOI in `CITATION.cff`, `README.md` or `docs/paper-block.md`.

## Secrets and vars (names only)

- Repo Actions secrets: none. CI needs none.
- npm: the maintainer's own npm login on the publishing machine (no `NPM_TOKEN` in the repo).
- Zenodo: a repository webhook (event `release`) whose URL carries a Zenodo access token. Never copy that URL into a file.
- Runtime env vars the CLI reads from the user (documented in README): tracker API keys such as `LINEAR_API_KEY`. Not deploy secrets.

## After the transfer to naucodehq (done 20/10/2026)

- [x] Hardcoded `2ngnhan/certainty-scan` paths moved to `naucodehq/certainty-scan` in `package.json` (repository, homepage, bugs), `CITATION.cff`, `docs/paper-block.md`, `src/report.js`, `src/config.js`, `src/actions.js`.
- [ ] npm package metadata still shows `2ngnhan` until the next `npm publish`.
- [ ] Zenodo: the webhook moved with the repo and is active, but the Zenodo GitHub integration is tied to the account that enabled it. Check on zenodo.org (GitHub tab) that `naucodehq/certainty-scan` is listed and switched on before the next release (chưa kiểm). If it is not, the release will not archive.
- [ ] Local clones: `git remote set-url origin https://github.com/naucodehq/certainty-scan.git`.
- [ ] The docs site repo `2ngnhan/certainty-audit` links here; its links were updated to `naucodehq` on 20/10/2026.
