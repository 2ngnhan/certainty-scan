# Paper insert — computed hill position, gate, and artifact declaration

Replacement text for the `C_k(t)` block, plus the artifact-availability
declaration. Every number below is verified against `src/certainty.js` at
`INSTRUMENT_VERSION = '0.3.0'`.

> **Why the original block cannot ship.** The formula
> `C_k(t) = w₁·I_DC(t) + w₂·D_I(t) + w₃·T_C(t)` describes an instrument that
> does not exist in the implementation. `interface`, `coverage`, `coupling`,
> `mock`, and `contract` appear **zero times** in the scoring engine and in all
> four adapters. Neither of the two candidate gate conditions
> (`C_k ≥ 0.75 ∧ I_DC = 1.0`, or `I_DC = 1.0 ∧ D_I ≥ 0.85`) is implemented.
> Publishing it would assert a measurement mechanism with no code behind it.
>
> The *mechanism* claim in the surrounding prose — that the marker advances on a
> recorded condition rather than a human assertion — **is** true of the
> implementation, and survives intact below.

---

## A. Replacement text

### A.1 The position function

A scope's position on the hill is not asserted by a team member; it is computed
from evidence recorded in the issue tracker. For work item *k* at time *t*, the
instrument assigns a certainty score

**C_k(t) = Σᵢ sᵢ(k, t)**,  where *i* ranges over five signals and C_k(t) ∈ [0, 100]

| Signal *i* | Max sᵢ | Definition |
|---|---|---|
| Validation | 40 | `validated` **with linked evidence** (merged PR, commit, closing keyword, sign-off) → 40; labelled `validated` without linked evidence → 20; `assumed` → 10; otherwise 0 |
| Dependencies | 20 | all declared dependencies resolved → 20; some open → 10; the item or any dependency blocked → 0; none declared → 10, flagged for review |
| Acceptance criteria | 15 | present and verifiable (≥ 2 testable clauses, or Given/When/Then) → 15; present but generic → 5; absent → 0 |
| Evidence | 15 | description structure, 5 each for goals, method, and dependency notes |
| Discussion | 10 | a recorded decision → 10; exchange without a conclusion → 5; none → 0 |

The hill coordinate is a monotonic rescaling of this score onto the conventional
1–9 reading axis:

**H_k(t) = 1 + 8 · C_k(t) / 100**

Because H is strictly increasing in C, the coordinate carries no information
beyond the score; it exists so that machine output and a project manager's
independent 1–9 rating share an axis. All comparisons in §[eval] are therefore
rank-based.

### A.2 The crest condition

The crest is the boundary between the exploratory and executional halves of the
hill. A scope crosses it when

**C_k(t) ≥ 50**

and not before. The condition is evaluated from recorded evidence at each sync;
no participant can advance the marker by declaring the work understood.

Two properties of this construction matter more than the threshold itself.

First, **relabelling cannot cross the crest alone.** Marking an item `validated`
without linked evidence yields 20 of a possible 40 on the validation signal — by
itself insufficient, since 50 requires corroboration from at least two further
signals. The instrument therefore distinguishes a claim of validation from
evidence of it.

Second, **machine-authored documentation is capped until a human confirms it.**
Items bearing an AI-authorship marker and lacking a human confirmation signal
have their acceptance-criteria and evidence contributions capped at 5 each, and
are reported separately as the machine-generated, unconfirmed share of the
backlog. Without this rule an assistant could raise a project's measured
certainty by generating documentation about its own output.

### A.3 Provenance of the weights and the threshold

The weights (40/20/15/15/10) and the crest threshold (50) are **set by
judgement, not empirically calibrated.** They encode a single design commitment:
that direct confirmation an item works should outweigh all documentation of
intent combined. We state this plainly rather than supply a post-hoc theoretical
derivation, because a derivation constructed after the fact would be unfalsifiable
by any measurement and would add no information.

Calibration is specified but not yet performed. The procedure is a sealed-reveal
protocol: the instrument scores a live backlog and encrypts the result locally
(AES-256-GCM, key held by the researcher, envelope metadata bound as additional
authenticated data); the project manager rates the same items independently on a
1–9 scale without access to any machine output; the results are then opened
together and compared by Spearman rank correlation. This design exists to prevent
anchoring, which would otherwise inflate agreement. It is implemented and
released in the artifact (§[artifact]) but has not been run to completion on a
live project, and we make no claim of criterion validity for the instrument.

The conditions we accept as falsifying are stated in advance:

1. ρ < 0.4 between machine and independent expert rankings across ≥ 3 teams, n ≥ 20 items each;
2. items scoring ≥ 80 proving no less defect-prone than items scoring < 50 under blind audit;
3. any single signal carrying no discriminating information across teams;
4. teams raising the aggregate substantially with no change in defect rate or review friction.

### A.4 Scope of the claim

The mechanism generalises only as far as its inputs. Each of the five signals
reads a durable trace that software teams already produce — a merge, a linked
commit, a dependency edge, a written acceptance criterion, a recorded decision.
For this class of work the conditions in Table [N] can therefore be evaluated
without a human assertion in the loop.

We do not claim the score measures correctness. It measures whether the evidence
that would justify confidence exists; an item documenting a mistaken assumption
in exemplary form scores highly. Closing that gap requires an external criterion —
blind expert audit of the work itself — which is specified in the artifact and
left as future work. Establishing equivalent machine-evaluable conditions for
non-code claims is an open design problem, and we do not claim to have solved it.

---

## B. Reviewer questions, pre-answered

Keep these ready; both are near-certain.

**"How were w₁ … w₅ determined?"**
By judgement, stated as such in §A.3 and in the artifact's published
specification, which contains an explicit *What is not claimed* section. The
calibration procedure is implemented and its falsification conditions are
published in advance. No empirical claim is made for the weights.

**"Is the threshold of 50 empirically grounded?"**
No, and the paper says so. It is the midpoint of the score range, chosen so the
crest divides the hill symmetrically. The paper's contribution is that the
crossing is *computed from recorded evidence* rather than asserted — a property
that holds for any threshold. If a reviewer prefers, the numeric threshold can be
removed from the paper entirely and the mechanism described qualitatively without
weakening any claim.

**Optional pre-emption, if you want to close it fully:** run the sealed-reveal
protocol once on a live backlog before submission. One project, one PM, roughly
two hours of their time, and the result is a single ρ. A reported ρ — even a
disappointing one — converts §A.3 from a promissory note into a finding.

---

## C. Artifact declaration

### C.1 Availability statement

> **Artifact availability.** The instrument described in this paper is released
> as `certainty-scan`, an open-source command-line tool (MIT licence), archived
> at **doi:10.5281/zenodo.22026189**. Source:
> `https://github.com/2ngnhan/certainty-scan`. Package:
> `https://www.npmjs.com/package/certainty-scan`. The scoring engine, the four
> tracker adapters, the sealed-reveal validation protocol, and the full
> instrument specification — including its stated limitations and falsification
> conditions — are contained in the archived record. All results reported here
> were produced with package version 0.5.1, instrument version 0.3.0. Every
> generated report and data export carries the instrument version, so any figure
> can be traced to the exact scoring rules that produced it. **The tool performs
> no model inference: scoring and the recommended-action list are deterministic
> rule evaluations, so a given backlog yields an identical report on every run.**
> It runs locally and requires no server; no project data is transmitted.

### C.2 Metadata table

| Field | Value |
|---|---|
| Artifact name | `certainty-scan` |
| Package version | 0.5.1 |
| **Archived DOI (cite this)** | **10.5281/zenodo.22026189** |
| Concept DOI (all versions) | 10.5281/zenodo.22026188 |
| **Instrument version** | **0.3.0** — stamped into every report and export |
| Licence | MIT |
| Author | Nhan Nguyen — nhan@naucode.com |
| Repository | https://github.com/2ngnhan/certainty-scan |
| Package registry | https://www.npmjs.com/package/certainty-scan |
| Documentation | https://certainty.naucode.io |
| Specification | `docs/instrument-design.md` in the repository |
| Language / runtime | JavaScript (ES modules), Node.js ≥ 18 |
| Size | ~2,640 lines across engine, adapters, and CLI |
| Tests | 69, all passing (`npm test`, Node built-in runner) |
| Runtime dependencies | `chalk` (MIT), `commander` (MIT), `js-yaml` (MIT) |
| Supported data sources | GitHub Issues, Linear, Jira, Notion |
| Network behaviour | Reads the configured tracker API only; writes all output to the local filesystem |
| Reproduction | `npx certainty-scan init && npx certainty-scan sync` — public GitHub repositories need no credentials |

### C.3 Minimal reproduction

Runs against any public GitHub repository with no API key:

```bash
npx certainty-scan init
# set in certainty.config.yaml:
#   source: github
#   github: { repo: <owner>/<name> }
npx certainty-scan sync
```

Writes `certainty-report.html` (per-item scores with full signal breakdown) and,
with `--json`, `certainty-data.json` (machine-readable, `certainty_breakdown` per
item).

### C.4 Reproducing the validation protocol

```bash
npx certainty-scan init --research <PAIR-ID>   # records pair id and consent
npx certainty-scan sync --research --dry-run   # prints the metadata read manifest; scores nothing
npx certainty-scan sync --research             # scores, then seals
npx certainty-scan unseal --key <KEY> --rating rating.json
```

The sealed sync writes an encrypted result, a local rating sheet for the project
manager containing no scores, and a sealing key that travels to the researcher
rather than the team. `unseal` opens the comparison and reports Spearman ρ. The
only file that leaves the machine is `certainty-research-export.json`: item ids,
scores, and signal values with hashed titles — no titles, no names, no source code.

### C.5 Version note for the camera-ready

The instrument version must match the reported results. If any figure is
regenerated before submission, confirm the stamp in the report footer still reads
`instrument v0.3.0`; if the scoring rules change, the stamp changes and the
version in §C.1 must be updated to match.

---

## D. Prerequisites before the paper can cite this

Neither is done yet. Both are required for the URLs in §C to resolve.

1. **Rename the GitHub repository** `2ngnhan/certainty-units` → `2ngnhan/certainty-scan`.
   GitHub redirects the old URL, but the paper should cite the canonical one.
2. **Publish `certainty-scan@0.5.0` to npm.** The package currently exists under
   the previous name; `npm publish` under the new name is required before
   `npx certainty-scan` works for a reader.

Optionally,  — most venues prefer an immutable identifier, and it
protects the citation against any later rename.
