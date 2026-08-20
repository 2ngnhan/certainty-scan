# certainty-scan

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22026189.svg)](https://doi.org/10.5281/zenodo.22026189)
[![npm](https://img.shields.io/npm/v/certainty-scan)](https://www.npmjs.com/package/certainty-scan)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)


Free, open-source certainty scoring for project work items.
Connects to **GitHub Issues, Linear, Jira, Notion** (Monday + ClickUp coming).
Outputs a static HTML dashboard + Markdown report — zero server required.

```
npx certainty-scan sync
```

Teams that track success by counting effort (points, tickets closed) see *how much* is moving —
certainty-scan shows *how sure you are* about what's moving, and what would make you surer.

## Quick start

Fastest path — score any public GitHub repo, no API key needed:

```bash
npx certainty-scan init
# edit certainty.config.yaml:
#   source: github
#   github:
#     repo: your-org/your-repo
npx certainty-scan sync

# Output: certainty-report.html  (open in any browser)
```

For Linear / Jira / Notion, set the API key env var and run the same command:

```bash
LINEAR_API_KEY=lin_api_xxx npx certainty-scan sync
```

Every sync prints instant insights in the terminal:

```
278 items  ·  avg certainty 58% (tier-weighted)  ·  56% unweighted
  high 68  medium 116  low 54  uncertain 40

Since last sync (2026-06-27):  avg 54% → 56%  ▲ +2  ·  12 new items
  ▼ 45 → 20  ENG-142  Add SSO support
  ▲ 30 → 80  ENG-98   Migrate billing

Least certain open items:
    5% #1099  always_allow permission policy not honored
        missing: validation +40, acceptance criteria +15, discussion +10
```

## What it scores

Each work item gets a **Certainty Score (0–100)**, scoring model **v0.2**:

| Signal | Max points | How it maps |
|--------|-----------|-------------|
| Validation status | 40 | `validated` **with linked evidence** (merged PR, commit, `fixes #n`) → 40 · labelled `validated` without evidence → 20 · `assumed` → 10 |
| Workflow / dependencies | 20 | all declared dependencies done → 20 · some still open → 10 · item or any dependency blocked → 0 · none declared → 10, flagged for PM review |
| Acceptance criteria | 15 | present and verifiable (2+ testable bullets, or Given/When/Then) → 15 · present but generic → 5 |
| Evidence | 15 | description structure, 5 each: goals · how-to / guideline · dependency and collaboration notes |
| Discussion | 10 | recorded decision ("Decision: …" comment, section, or label) → 10 · exchange without a conclusion → 5 |

The **Tier** (basic / intermediate / advanced) is no longer additive points:
it weights items during aggregation (×0.5 / ×1.0 / ×2.0), so certainty about
unfamiliar, high-impact work counts for more. Missing tier defaults to ×1.0.

Three anti-circularity rules keep the score honest:

1. AI-generated documentation earns full Evidence and Acceptance Criteria credit
   only with a human confirmation signal (a review label or linked evidence);
   otherwise both are capped and the item is reported in the machine-generated,
   unconfirmed share of the backlog.
2. Issues the tool itself files (`next --create-issues`) are labelled
   `certainty-generated` and excluded from scoring on every later sync.
3. Relabelling an item `validated` without linked evidence never earns full credit.

Scores map to levels: **high** (≥80) · **medium** (≥50) · **low** (≥20) · **uncertain** (<20)

Every score is auditable: hover the score bar in the HTML report for the per-signal
breakdown, and `certainty-data.json` (via `--json`) includes `certainty_breakdown` per item.
Every report and export is stamped with the scoring instrument version.

## Feed it real signals

The score is only as honest as its inputs, so the adapters read signals your team
already produces:

- **Acceptance criteria** are detected automatically from an `## Acceptance Criteria`
  heading (or `**Acceptance Criteria**`, or an `Acceptance criteria:` line) in the
  item description, or from a markdown checklist (`- [ ] …`). In Notion, use an
  `Acceptance Criteria` column.
- **Validation labels** override workflow-derived validation. Label an item
  `validated`, `assumed`, or `needs-clarification` (Notion: tags) to record validation
  explicitly instead of letting "closed" imply "validated".
- **Linked evidence** is read from PR/commit URLs and closing keywords
  (`fixes #12`) in descriptions and comments, from Linear's GitHub/GitLab
  attachments, and it is what turns `validated` from 20 into 40 points.
- **Dependencies** are read from tracker links (Jira issue links, Linear
  "blocks" relations) and from declarations in the description
  (`depends on #12`, `blocked by ENG-42`). A `blocked` label zeroes the
  workflow signal.
- **Decisions** are read from a `Decision:` / `Conclusion:` comment or
  description section, or a `decision` label. Comment volume alone never
  scores more than 5.
- **tier labels** — `certainty:basic`, `certainty:intermediate`, `certainty:advanced` — set the tier
  directly on any tool that has labels.

## From score to action

The score is the diagnosis; `next` is the prescription:

```bash
npx certainty-scan next             # this week's certainty to-do list
npx certainty-scan next --create-issues   # file each plan as a follow-up issue
```

`next` takes your least certain open items and prints concrete, assignable actions
(validate this assumption, write acceptance criteria for that, size this one).
`--create-issues` files them straight into your repo as checklist issues
(GitHub source, needs a token with write access) and skips items that already
have an open follow-up.

## Track movement, not just state

Each sync snapshots per-item scores to `.certainty-history.json` and the next sync reports
what moved: average trend, biggest drops and rises, new items. Commit the file (or
cache it in CI) to keep the trail. Disable with `--no-history`.

When delivered delivery volume rises while average certainty stays flat or falls, the
sync flags **certainty debt**: output is accelerating faster than validation. This
is the number to watch on AI-augmented teams.

## Sealed reveal

The same tool can run behind a sealed-reveal protocol, so the PM's independent
certainty rating cannot be anchored by the machine's output. This is how the
[certainty audit](https://certainty.naucode.io/audit/) produces its blind comparison:

```bash
npx certainty-scan init --research PAIR-ID       # records the issued pair id + consent
npx certainty-scan sync --research --dry-run     # prints the metadata read manifest, scores nothing
npx certainty-scan sync --research               # scores, then seals the results
npx certainty-scan unseal --key KEY --rating rating.json
```

A sealed sync writes `certainty-report.sealed` (encrypted results), a local
`certainty-rating-sheet.html` for the PM (no scores, no network), and a sealing key
that travels to your auditor. After the PM's `rating.json` is
submitted, the key comes back and `unseal` opens the report with a **Delta
view**: machine scores next to the PM's independent ratings, with the Spearman
rank correlation. It also writes `certainty-research-export.json`, the only file that
ever leaves the machine: item ids, scores and signals with hashed titles — no
titles, no names, no code. `sync --research --retrospective` audits a
completed benchmark project the same way. Everything is stamped with the pair
id and instrument version.

## Audit service

If you'd rather have this read for you: the paid [certainty audit](https://certainty.naucode.io/audit/)
adds an independent setup, a blind machine-vs-PM comparison, and a written recommendation,
delivered in a one-hour walkthrough. The tool stays free and local either way.

## Use it as a CI gate

```bash
certainty-scan sync --fail-below 50   # exit 1 if avg certainty < 50%
```

Put it in front of a sprint kickoff or release train to block on too much uncertainty.

## Post to Slack

```bash
certainty-scan sync --slack-webhook https://hooks.slack.com/services/…
```

Posts the summary and least-certain items to a channel (or set `output.slackWebhook`
in the config).

## Supported sources

| Tool | Status | Auth |
|------|--------|------|
| GitHub Issues | ✅ | none for public repos, token for private |
| Linear | ✅ | API key |
| Jira | ✅ | API token |
| Notion | ✅ | API key |
| Monday.com | 🚧 coming | |
| ClickUp | 🚧 coming | |

## Config reference

```yaml
project: My Project
source: github          # github | linear | jira | notion

github:
  repo: owner/name
  token: ${GITHUB_TOKEN}       # optional for public repos
  # state: all                 # all | open | closed
  # limit: 500                 # most recently updated issues to fetch

linear:
  apiKey: ${LINEAR_API_KEY}    # env var expansion supported
  teamId: your-team-id

jira:
  host: yourteam.atlassian.net
  email: you@example.com
  apiToken: ${JIRA_API_TOKEN}
  projectKey: MYPROJECT

notion:
  apiKey: ${NOTION_API_KEY}
  databaseId: your-database-id

output:
  html: certainty-report.html
  markdown: certainty-report.md       # optional
  history: .certainty-history.json    # optional — score snapshots for deltas
  # slackWebhook: https://hooks.slack.com/services/…
```

### Field mapping

Every tool uses different status names. Override the defaults:

```yaml
linear:
  apiKey: ${LINEAR_API_KEY}
  teamId: abc123
  fieldMap:
    validation_status:
      field: state.type       # dot-path into the Linear issue object
      map:
        completed: validated
        started: assumed
    tier:
      field: estimate
      map:
        1: basic
        3: intermediate
        8: advanced
```

## Automate with GitHub Actions

1. Copy [examples/certainty-report.yml](examples/certainty-report.yml) to `.github/workflows/` in your repo
2. Add your API key as a repo secret (`LINEAR_API_KEY`, or nothing for public GitHub repos)
3. Enable GitHub Pages → the report publishes every Monday, with week-over-week deltas

## License

MIT — free to use, modify, and embed. "Propozel" and "Certainty Units" are
trademarks; the license covers the code, not the branding (see [NOTICE](NOTICE)).

---

Built on the [Certainty Units](https://propozel.com) methodology.
