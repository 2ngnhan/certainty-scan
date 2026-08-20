# Certainty Instrument — Design Specification

**Status:** v0.3. `INSTRUMENT_VERSION = '0.3.0'` ships the vocabulary settled in §3.1;
**scoring is byte-identical to v0.2** — same five signals, same weights, same
anti-circularity rules. The additions specified here (RCE §6.3, CAD §7.1, F_risk §8.1,
gaming detection §6.4) are **designed, not built** — a report stamped `0.3.0` does not
mean any of them ran. See §14 for the exact build state.
**Supersedes:** the implicit specification carried in `src/certainty.js` comments and
`README.md`.
**Last revised:** 2026-08-20
**Vietnamese edition:** [`instrument-design.vi.md`](instrument-design.vi.md) — same
section numbering, cross-referenceable.

---

## 0. How to read this document

This specification separates three things that are easy to conflate, and the
separation is the point:

| Layer | What it is | Epistemic status |
|---|---|---|
| **Implemented** | Behaviour you can read in `src/` today | Verified against source |
| **Specified** | Designed here, not yet built | Proposal |
| **Calibrated** | Backed by measurement against an external criterion | **Nothing is here yet** |

Every weight in this instrument is a **hand-set prior**. None has been calibrated
against an external criterion. This document does not retrofit theory onto those
priors — where a number was chosen by judgment, it says so, and states the procedure
that would replace judgment with measurement. Retroactively fitting theory to an
existing design is a known failure mode (see §12.4) and is refused here.

---

## 1. Problem statement

**Claim.** In AI-assisted knowledge work, effort ceases to be a usable proxy for
progress, because effort becomes cheap while validation does not. Teams that track
throughput therefore observe acceleration and mistake it for progress.

**What this instrument measures.** For each work item, how much of the evidence that
would justify confidence actually exists, and what specific evidence is missing.

**What it does not measure.** Whether the item is correct. See §7.2 — this is the
instrument's central limitation and the reason the outer loop exists.

**Falsification of the problem statement.** The premise fails if, in AI-assisted
delivery contexts, effort-based metrics (velocity, hours) retain high correlation
(r > 0.8) with delivered outcome value across a sample of N > 50 projects. Under
that finding, this instrument solves a problem that does not exist.

---

## 2. Scope boundary

**In scope.** Software and digital product delivery tracked in an issue tracker
(GitHub Issues, Linear, Jira, Notion), where work items carry descriptions,
labels, comments, and links to code artifacts.

**Out of scope.**

- Work not represented as discrete tracked items.
- Manual/physical work where effort remains a linear proxy for output.
- Creative work with no acceptance criterion that a third party could apply.
- Real-time or safety-critical assurance. This is a management instrument, not
  a verification tool.

**Preconditions for the score to mean anything.**

1. The team writes item descriptions at all. An empty tracker scores near zero and
   the score is correct but useless.
2. Evidence links (PRs, commits, closing keywords) are actually attached.
3. Someone is willing to act on a low score rather than relabel to raise it.

**Conditions under which the instrument degrades.**

- Teams optimising the score directly (Goodhart). Detection: §6.4.
- Trackers used as a rubber stamp after work completes, so evidence appears
  simultaneously and validation ordering is unreadable.
- Heavy AI authorship without human confirmation — partially mitigated by §4.7,
  not eliminated.

---

## 3. Vocabulary

Three distinct quantities have circulated under overlapping names. This section is
normative; the definitions here override any earlier document.

| Term | Definition | Range | Where it lives |
|---|---|---|---|
| **Certainty Score** | Evidence sufficiency for one work item | 0–100 | This instrument, `certainty_score` |
| **Tier** | Aggregation weight expressing how much an item's certainty matters | basic 0.5 · intermediate 1.0 · advanced 2.0 | `tier` |
| **Item estimate** | Whatever size number the tracker already carries | tracker-defined | `estimate` — see §6.1 |

**Deprecated and withdrawn.**

- *"Certainty Unit" as a Fibonacci level (0·1·3·5·8·13)* — an earlier draft in the
  LIFT methodology spec. Never implemented. Withdrawn: it modelled certainty as a
  single ordinal level, which cannot express *which* evidence is missing, and the
  actionable output of this tool is exactly that. Replaced by the Certainty Score.
- *"CU velocity"* — misleading name for a story-point sum. Renamed to delivery volume
  in §6.1.
- *BVU (Business Value Unit)* — a commercial-layer construct from separate research.
  Not part of this instrument. Kept out deliberately: mixing a value-for-billing unit
  into an evidence-sufficiency instrument would make the score negotiable.
- ***"CU" as an abbreviation, in every form*** — removed from the codebase, the CLI,
  the file names, the label convention, and the package name in v0.3. Rationale below.

### 3.1 Why "unit" was removed, and how far

A unit carries three properties by definition. Certainty has none of them:

| Property of a unit | Holds for certainty? |
|---|---|
| **Additive** — 2 + 3 = 5 | No. Certainty about A plus certainty about B is not certainty about A-and-B. |
| **Ratio scale** — 10 is twice 5 | No. 80 is not twice as certain as 40; the score is ordinal (§4.1). |
| **Universal** — a metre is a metre anywhere | No. §11 disclaims cross-team comparison outright. |

Naming the quantity a "unit" therefore asserted three things the instrument denies.
That is a category error, and it was not harmless: it produced a live three-way
collision between *CU* as a Fibonacci level in the LIFT draft, *CU* as the tracker's
story-point estimate in `cu_value`, and *BVU* as a billing unit in adjacent research.
The person who built all three made the mistake first, which is the evidence that the
name — not the reader — was at fault.

**The mechanical test.** The failure is not the word appearing anywhere; it is a
**number carrying a unit suffix**. `npx certainty-scan` forms no belief about
additivity. `42 CU delivered` does.

Four instances of the prohibited form had shipped in v0.2 — the certainty-debt line
and Slack payload in `cli.js`, and the hill-chart footer and completion-rate sub-label
in `report.js`. One of them suffixed `CU` onto a **story-point sum**, labelling an
effort quantity as a certainty quantity: the exact confusion, made literal.

**Scope of the v0.3 rename.** Rather than keep the abbreviation as an opaque token,
it was removed everywhere, because a token that no longer expands to anything invites
someone to re-expand it:

| Was | Is |
|---|---|
| `certainty-units` (package, CLI, repo) | `certainty-scan` |
| `cu.naucode.io` | `certainty.naucode.io` |
| `cu_tier`, `cu_value` | `tier`, `estimate` |
| `cu:basic` / `cu:intermediate` / `cu:advanced` labels | `certainty:basic` / `:intermediate` / `:advanced` |
| `cu-report.html`, `cu-data.json`, `.cu-history.json` | `certainty-report.html`, `certainty-data.json`, `.certainty-history.json` |
| `cu-sealed` envelope format | `certainty-sealed` |
| `cu-generated` label | `certainty-generated` |
| `computeCUMetrics`, `CU_TIERS`, `completedCUValue` | `computeMetrics`, `TIERS`, `completedEstimate` |

**This is a breaking change**, and it was taken deliberately at this moment rather than
deferred. The window was open precisely because **the pilot in §9 has not run**: no
sealed export, no issued pair id, and no published result yet carries the old name.
`INSTRUMENT_VERSION` exists to identify permanently what produced a given number —
renaming after research data exists would defeat the one guarantee that stamp makes.
The cost of the rename falls almost entirely on a 220-download-per-month package;
the cost of deferring would have fallen on the research record.

*"Certainty" is kept.* It names the goal, which is what product names legitimately do —
a thermometer is about temperature without claiming to be temperature. "Units" named a
quantity that does not exist, which is a different kind of claim.

---

## 4. The instrument — item-level Certainty Score

### 4.1 Structure and the origin of the weights

Five signals, 100 points total.

| Signal | Max | Question it answers |
|---|---|---|
| Validation | 40 | Has anything actually confirmed this works? |
| Workflow / dependencies | 20 | Is it standing on finished ground? |
| Acceptance criteria | 15 | Would a third party know whether it is done? |
| Evidence | 15 | Is the reasoning written down? |
| Discussion | 10 | Was a decision reached, or just talked about? |

**Provenance of the split — stated plainly.** The 40/20/15/15/10 division is a
hand-set prior reflecting one judgment: that direct confirmation an item works
outweighs all documentation of intent combined (40 vs 40 across the other four
signals, with workflow as the swing). It is not derived from theory and has not been
calibrated. The calibration procedure that would replace it is in §9; the specific
thing calibration would test is whether re-weighting improves rank agreement with
expert judgment.

**Ordinal, not cardinal.** The score is designed to rank items, not to support
arithmetic on the difference between 60 and 70. All validation in §9 uses rank
correlation for this reason.

**Bounded.** `computeSignalScore` clamps to 100. Signals never exceed their max, so
the clamp is defensive only.

---

### 4.2 Signal 1 — Validation (max 40)

**Construct.** Direct confirmation that the item does what it claims.

**Rule (implemented).**

| Condition | Points | Reason string |
|---|---|---|
| `validation_status = validated` **and** `linked_evidence` present | 40 | `validated with linked evidence` |
| `validation_status = validated`, no linked evidence | 20 | `labelled validated, no linked evidence` |
| `validation_status = assumed` | 10 | `assumed` |
| anything else (`unvalidated`, `needs_clarification`, …) | 0 | status text, underscores replaced |

**Data source.** Explicit labels (`validated`, `assumed`, `needs-clarification`)
override workflow-derived status. `linked_evidence` is read from PR/commit URLs,
closing keywords (`fixes #12`) in descriptions and comments, and Linear's
GitHub/GitLab attachments.

**Design note — why "closed" does not imply "validated".** The status ladder is
deliberately not derived from workflow state. A closed ticket is evidence that
someone stopped working, not that the work was confirmed. This is the single most
consequential design decision in the instrument, and the most likely to be
unpopular with teams whose closed count is their reporting metric.

**Known weakness.** `linked_evidence` is presence-checked, not quality-checked. A
merged PR that does nothing satisfies it. Mitigation is the outer loop (§7), not
a cleverer regex.

**Falsification.** If items scoring 40 here are no less defect-prone under blind
audit than items scoring 20, this signal is not measuring validation and the
distinction should collapse.

---

### 4.3 Signal 2 — Workflow / dependencies (max 20)

**Construct.** Whether the item's foundations are settled.

**Rule (implemented).** Evaluated in this order:

| Condition | Points | Reason |
|---|---|---|
| item blocked, or any dependency blocked | 0 | `blocked` / `a dependency is blocked` |
| no dependencies declared | 10 | `no dependencies declared (flagged for PM review)` |
| all dependencies `done` | 20 | `all N dependencies done` |
| some dependencies open | 10 | `M of N dependencies still open` |

**Data source.** Tracker relations (Jira issue links, Linear `blocks`) and
in-description declarations (`depends on #12`, `blocked by ENG-42`). A `blocked`
label zeroes the signal regardless of tracker state.

**Design note — no carve-out for completed items.** A done item with no declared
dependencies stays at 10, not 20. The signal reads dependency state only; it does
not reward completion, because completion is Signal 1's business. This surprises
users and is intentional.

**Known weakness.** Undeclared dependencies are indistinguishable from genuinely
independent work. Both land on 10. The `no_dependencies_declared` flag exists so
the ambiguity is visible rather than silently averaged in; on backlogs where most
items are genuinely independent this signal contributes a near-constant 10 and
carries little information.

**Falsification.** If the flag rate exceeds ~80% of items across pilot teams, the
signal is not discriminating and its 20 points should be redistributed.

---

### 4.4 Signal 3 — Acceptance criteria (max 15)

**Construct.** Whether "done" is defined well enough for a third party to check.

**Rule (implemented).**

| Condition | Points |
|---|---|
| present and verifiable | 15 |
| present but generic | 5 |
| absent or whitespace | 0 |

**"Verifiable" is decided by `isVerifiableAC`**, which requires either:

- **≥ 2** lines matching a checklist/bullet/numbered pattern
  (`- item`, `* item`, `+ item`, `- [ ] item`, `1. item`, `1) item`), **or**
- **≥ 2** of the tokens `given` / `when` / `then` present as whole words.

**Data source.** An `## Acceptance Criteria` heading (or `**Acceptance Criteria**`,
or an `Acceptance criteria:` line) in the description, a markdown checklist, or a
Notion `Acceptance Criteria` column.

**Known weakness.** The test is structural, not semantic. Two bullets of nonsense
score 15. This is a deliberate trade: a semantic test would require a model call
per item, which makes the score non-deterministic and non-auditable, and would put
an AI in the position of grading AI output — the failure mode §4.7 exists to prevent.
Structure is a weak proxy chosen because it is cheap, stable, and inspectable.

**Falsification.** If verifiable-AC items are not measurably easier to accept — no
difference in review iterations under §6.3 — the structural proxy fails and the
signal should either move to semantic evaluation or be dropped.

---

### 4.5 Signal 4 — Evidence (max 15 = 5 + 5 + 5)

**Construct.** Whether the reasoning behind the item is recorded.

**Rule (implemented).** Three independent components, 5 points each, detected by
regex against the description (bilingual EN/VI):

| Component | Matches headings/labels like |
|---|---|
| **goals** (5) | goal, objective, purpose, why, context, mục tiêu, lý do, bối cảnh |
| **how-to** (5) | how, approach, steps, plan, guideline, implementation, solution, cách làm, hướng dẫn, giải pháp, các bước |
| **dependency notes** (5) | dependency, depends on, blocked by, coordination, collaboration, phụ thuộc, phối hợp |

Patterns anchor to line start and tolerate `#` heading markers and `**bold**`.

**Non-double-counting rule.** This signal reads *description structure only*.
Tracker dependency links belong to Signal 2 and never earn points here. An empty
description scores 0.

**Known weakness.** Rewards document shape over content — a description with the
three headings and nothing under them scores 15. Same trade-off and same reasoning
as §4.4.

---

### 4.6 Signal 5 — Discussion (max 10)

**Construct.** Whether deliberation reached a conclusion.

**Rule (implemented).** `discussionState` returns:

| State | Trigger | Points |
|---|---|---|
| `decision` | a `decision`/`decided`/`concluded`/`decision-recorded` label, **or** a Decision/Conclusion/Resolution/Kết luận/Quyết định/Chốt section in the description, **or** a comment matching the decision pattern (`Decision:`, `decided`, `we agreed`, `agreed to`, `approved`, `signed off`, `thống nhất`, `chốt là`) | 10 |
| `exchange` | comments exist but no conclusion detected | 5 |
| `none` | no comments, no citations | 0 |

**Design note — deliberately not a comment count.** Comment volume never scores
above 5. A 40-comment thread with no conclusion is a symptom, not evidence. This
inverts the usual engagement heuristic on purpose.

**Known weakness.** Keyword detection misses conclusions phrased unusually and
false-positives on the word "approved" in unrelated context.

---

### 4.7 Anti-circularity rules

The instrument's most important property is that **it must not be gameable by the
same automation it is measuring.** Three rules, all implemented.

**Rule 1 — machine-written documentation is capped until human-confirmed.**

- *AI-generated* is detected by `AI_MARKER_RE` (`generated by/with ai|claude|copilot|chatgpt|gpt|cursor|gemini|codex`, `Co-authored-by: …`, `🤖`, `[ai-generated]`) or by an `ai-generated` / `machine-generated` label.
- *Human-confirmed* requires `linked_evidence`, or a `human-reviewed` / `reviewed` / `review:done` label.
- Unconfirmed AI items have **Acceptance criteria capped at 5** and **Evidence capped at 5**, with the cap stated in the reason string, and carry the flag `machine_generated_unconfirmed`. The count is reported in every sync.
- Validation (Signal 1) is **not** capped — it already requires linked evidence for full credit.

**Rule 2 — the tool never scores its own output.** Issues filed by
`next --create-issues` are labelled `certainty-generated` and excluded from scoring on
every later sync. Without this, a tool that files documentation tasks raises the
score by filing them.

**Rule 3 — relabelling is not validation.** Marking an item `validated` without
linked evidence earns 20, never 40. Implemented in §4.2 and restated here because
it is the rule most often argued about.

**What these rules do not cover.** A human who pastes AI output without the marker,
under their own name, with a trivial PR attached, defeats all three. The rules
raise the cost of gaming; they do not make it impossible. The honest defence is
§7.

---

### 4.8 Levels and hill position

| Score | Level |
|---|---|
| ≥ 80 | `high` |
| ≥ 50 | `medium` |
| ≥ 20 | `low` |
| < 20 | `uncertain` |

`hillPosition(score) = round((1 + score/100 × 8) × 10) / 10` maps to the 1–9 scale
used in the delta view, so machine output and the PM's 1–9 rating are on comparable
axes. **Rank order is what §9 compares** — the mapping exists for display, not to
license arithmetic across the two scales.

Thresholds are hand-set. `uphill`/`downhill` split at 50.

---

## 5. Aggregation

### 5.1 Tier

A weight, not points. Set explicitly by label `certainty:basic` / `certainty:intermediate` /
`certainty:advanced`, or by an adapter field mapping. **Missing tier defaults to
intermediate (1.0).**

| Tier | Weight | Intended meaning |
|---|---|---|
| basic | 0.5 | Familiar, low-impact, well-trodden |
| intermediate | 1.0 | Default |
| advanced | 2.0 | Unfamiliar or high-impact — certainty here matters more |

**Rationale.** Certainty about routine work is cheap and uninformative; certainty
about unfamiliar high-impact work is what a PM is actually buying. Flat averaging
lets a backlog of trivia hide uncertainty where it counts.

**Known weakness.** Tier is PM-assigned and unaudited. A PM who wants a higher
average marks uncertain work `basic`. Detection: report the tier distribution
alongside the average and alert on drift. **Specified, not implemented.**

### 5.2 Weighted average

```
aggregate = Σ(score_i × w_i) / Σ(w_i)          expressed 0–100
```

Implemented as `weightedSum / weightSum`, algebraically identical to the
`Σ(score×w) / Σ(100×w) × 100` form in the source comment.

Both weighted and unweighted averages are reported. Divergence between them is
itself a signal: it means certainty is unevenly distributed across tiers.

---

## 6. Derived metrics

### 6.1 Delivery volume — **rename, v0.3**

**Implemented today as** `velocity: completedEstimate` = Σ `estimate` over completed
items, where `estimate` comes from:

| Adapter | Source | Note |
|---|---|---|
| Linear | `issue.estimate ?? 1` | story points |
| Jira | `storyPoints ?? 1` | story points |
| Notion | configured estimate field `?? 1` | |
| GitHub | **hardcoded `1`** | so the sum is a closed-item count |

**The problem.** `estimate` is a story-point sum — an effort proxy. Calling it
"delivery volume" implies it is a certainty quantity. It is not, and the naming
collision made it read as one. On GitHub it is literally a ticket count, which is
the metric the instrument's premise argues against.

**v0.3 resolution.**

1. **Rename** the field to `delivery_volume` in reports and history. It is a
   throughput number and should be labelled as one.
2. **Keep it.** Throughput is not meaningless — it is the term §6.2 needs. The
   error was calling it certainty, not computing it.
3. **Report its basis** in every sync (`delivery volume: 43 story points` vs
   `43 items`), so no reader assumes cross-team comparability.

### 6.1b Validated share

**Construct.** Of the work that finished, how much was confirmed rather than merely closed.

**Formula (implemented).**

```
validated_share = |completed ∧ validation_status = validated| / |completed|
```

Reported as a percentage; 0 when nothing is completed. Field name in code remains
`integrityScore` for backward compatibility with existing history files; **display
label is "Validated share"** everywhere.

**Rename rationale.** "Integrity score" named a *ratio* as if it were a score, and
implied a moral property of the team rather than a property of the record. It is a
share, and the label now says so. This is the same category error as §3's unit
collision, at a smaller scale.

**Known weakness.** Inherits Signal 1's ceiling — it counts the `validated` label,
so relabelling raises it. Unlike Signal 1 it has no linked-evidence gate. **Specified:**
require linked evidence for an item to count in the numerator, making it consistent
with §4.2.

### 6.2 Certainty debt

**Construct.** Output accelerating faster than validation.

**Implemented rule.**

```
debt = delivery_volume > previous.delivery_volume  AND  avg ≤ previous.avg
```

Requires both current and previous snapshots to carry the value; otherwise `null`.

**v0.3 change.** Report both variants side by side:

| Variant | Numerator | Reads as |
|---|---|---|
| **Throughput debt** (current) | delivery volume | "we are shipping more and knowing less" |
| **Confirmed-work debt** (new) | count of items reaching `certainty_score ≥ 80` | "we are shipping more and confirming no more of it" |

The second uses the instrument's own scale on both sides and is the honest form
of the claim. The first is retained because throughput is what teams already
report and the contrast is the argument.

**Known weakness.** A boolean over two consecutive snapshots is noisy — one slow
week inverts it. **Specified:** require the condition to hold over 3 consecutive
snapshots, or compare against a rolling 3-snapshot mean.

### 6.3 Review Cycle Efficiency (RCE) — **new in v0.3**

**Construct.** Review friction. How many review round-trips a deliverable needs
before acceptance.

**Basis.** Adapted from **DORA** and the **SPACE** framework; code-review iteration
counts as a productivity signal follow Bosu et al. (2015). This is an existing,
externally-grounded instrument, not a new invention — which is why it is preferred
over designing a fresh friction metric.

**Formula.**

```
RCE = Σ review iterations / number of deliverables in the window
```

An *iteration* is one `ReadyForReview → ChangesRequested` transition. A deliverable
accepted with no changes requested has 1 iteration.

**Data source.** PR review event history — already within reach of the GitHub
adapter, which reads PR links today. Linear and Jira expose review transitions
where the team uses them; where absent, RCE is reported as unavailable rather than
estimated.

**Control variable.** PR size (changed lines) must be reported alongside RCE. A
falling RCE with falling PR size is not an improvement in friction; it is smaller
batches.

**Target.** None asserted. Existing literature reports meaningful ranges; NAUCode
has no baseline yet. The first pilot establishes the baseline, and only then does
a target become statable. **Refusing to state a target before a baseline exists is
deliberate** — a target chosen now would be reverse-engineered from nothing.

**Why RCE belongs here.** It is the one number that can go *up* when a team adopts
AI heavily: generation accelerates, review does not, and the round-trips multiply.
The Certainty Score measures the evidence on an item; RCE measures what it cost to
get there. Together they distinguish "certain and cheap" from "certain and
exhausting".

**Status.** Specified. Not implemented.

### 6.4 Gaming detection — **specified, new in v0.3**

Any published score becomes a target. Instrumented counter-signals:

| Pattern | Detection |
|---|---|
| Bulk relabelling to `validated` | Rate of validation-status transitions per sync vs baseline |
| Boilerplate AC/evidence | Near-duplicate description structure across items (hash of heading skeleton) |
| Tier deflation | Shift in tier distribution while backlog composition is unchanged |
| Score-first, work-second | Items reaching high certainty with no linked code activity |

None of these are conclusive alone. They are reported as observations to the PM,
never as automatic penalties — an automatic penalty is itself gameable.

---

## 7. Outer validation loop

### 7.1 Correctness–Audit Divergence (CAD) — **new in v0.3**

**Construct.** Whether low certainty actually predicts defects. This is the
instrument's **criterion validity** test.

**Basis.** Standard recall of a risk classifier. The phenomenon it targets — capable
systems failing unpredictably just outside their competence — follows Dell'Acqua
et al. (2023), *Navigating the Jagged Technological Frontier* (HBS working paper).

**Procedure.**

1. Draw a random sample of accepted deliverables from a completed window.
2. Independent reviewers, blind to the certainty score, to authorship, and to
   logged effort, rate each **correct / defective** against the item's own
   acceptance criteria.
3. Compute:

```
CAD detection rate = |defective ∧ flagged low-certainty| / |defective|
```

where *flagged low-certainty* means score < 50 or carrying `machine_generated_unconfirmed`.

**Reliability requirement.** Reviewer agreement must be reported with the result.
With 3 raters, use **mean pairwise Cohen's κ with the minimum pairwise κ also
reported** — not Fleiss' κ. Fleiss generalises to fixed raters across items and
obscures a single disagreeing rater, which is exactly the signal that matters when
raters may share a systematic blind spot. Promotion gate: mean κ ≥ 0.60 **and**
min pairwise κ ≥ 0.40. Below 10 items the κ is unstable and must be labelled so.

**If reviewers are models rather than humans**, they must be from different
providers, and the run must be stamped **DEGRADED** if they are not — same-provider
judging produces agreement that reflects shared priors rather than shared truth.

**Status.** Specified. Not implemented. This is the highest-value unbuilt piece.

### 7.2 Why the inner score is insufficient on its own

All five signals measure **evidence hygiene**. None measures correctness. An item
with perfect documentation of a wrong assumption scores 100.

This is not a defect to be patched inside the instrument — it is a structural
limit of anything reading a tracker. The only repair is an external criterion, and
CAD is that criterion. **Until §7.1 runs at least once, every claim this instrument
makes is a claim about documentation, not about certainty**, and the documentation
should say so. It now does.

---

## 8. Gating

### 8.1 Item-level risk flag (F_risk) — **specified, new in v0.3**

A binary flag raised *before* an item is submitted for review, triggering mandatory
deep review rather than a score penalty.

Raise when any holds:

1. The author cannot self-verify the change within a short bounded time.
2. The work is in an unfamiliar domain for the author.
3. It touches high-coupling code (core modules, config, shared contracts).
4. It is AI-generated and not yet human-confirmed (§4.7 already computes this).

Condition 4 is derivable from data the tool already has. Conditions 1–3 are
self-declared. **A self-declared risk flag is only as honest as the culture around
it** — it must never feed into individual performance assessment, or it will be
under-reported to zero. This constraint is part of the design, not an afterthought.

### 8.2 CI gate

Implemented: `certainty-scan sync --fail-below 50` exits non-zero when the
weighted average falls below the threshold. Repo-level, blunt, and useful in front
of a sprint kickoff or release train.

v0.3 addition (specified): fail on *any* item above a tier threshold scoring below
a floor, rather than on the average — an average hides a single catastrophic item.

---

## 9. Validation protocol — sealed reveal

**The apparatus exists and is implemented.** It has not been run to completion on a
real project. That is the gap between this instrument and a calibrated one.

### 9.1 Hypotheses

| | Claim | Test |
|---|---|---|
| **H1** | Machine certainty scores rank items the same way an experienced PM does | Spearman ρ between machine score and the PM's independent 1–9 rating |
| **H2** | Making missing evidence explicit changes behaviour | Movement in signal composition after the reveal |
| **H3** | Documentation completeness relates to certainty | Per-item description length, AC presence, evidence components, exported for analysis |

### 9.2 Anchoring protection

The PM's rating must not be contaminated by the machine's output. Implemented as:

- `sync --research` scores locally, then **seals** the result: AES-256-GCM, random
  32-byte key, 12-byte IV. Envelope metadata (`format`, `pair_id`, `mode`,
  `instrument_version`) is bound in as AAD, so editing the envelope is detected at
  unseal.
- The key travels to the research contact, **not** to the team.
- The PM receives `certainty-rating-sheet.html` — local, no scores, no network.
- A config enrolled in a pilot **refuses** plain `sync`, so scores cannot leak out
  the side door.
- `--reveal-now` exists for partners who decline sealing; that pair is stamped
  `revealed_first` and **excluded from H1**, retained for H2/H3.

### 9.3 Data leaving the machine

`certainty-research-export.json` only: item ids, scores, signals, hashed titles. No titles,
no names, no code. Stamped with pair id and instrument version.

### 9.4 Reading the result

`unseal --key … --rating rating.json` opens the Delta view: machine score beside the
PM's rating, with Spearman ρ over the items rated before reveal.

| ρ | Reading |
|---|---|
| ≥ 0.7 | The instrument tracks expert judgment. The hand-set weights are defensible **by measurement**, and no theoretical justification is required. |
| 0.4 – 0.7 | Partial agreement. Inspect per-signal residuals: which signal drives the disagreement? |
| < 0.4 | The instrument does not measure what the PM measures. Either the weights are wrong or the construct is. Both are findings worth having early. |

**Minimum useful n.** Rank correlation on fewer than ~20 rated items is too noisy
to act on. A pilot below that size can still surface H2/H3 observations but must
not report ρ as evidence.

**Interpretation limit.** High ρ shows agreement with a PM, not correctness. A PM
can be confidently wrong. Only §7.1 addresses that, and the two tests answer
different questions: H1 asks *does this match expert judgment*, CAD asks *does
expert judgment match reality*.

---

## 10. Falsification conditions

The instrument should be revised or abandoned if:

1. **H1 fails** — ρ < 0.4 across ≥ 3 pilot teams with n ≥ 20 each.
2. **Criterion validity fails** — items scoring ≥ 80 are no less defect-prone under
   blind audit than items scoring < 50.
3. **A signal carries no information** — e.g. `no_dependencies_declared` exceeds 80%
   of items across teams, making Signal 2 a constant.
4. **The score is gameable at low cost** — teams raise averages substantially with
   no change in defect rate or review friction. §6.4 is the detector.
5. **The premise fails** — effort metrics retain r > 0.8 with delivered value in
   AI-assisted contexts (§1).

Each is a concrete observation, not a matter of opinion. Recording them here means
a later result cannot be reinterpreted as a success.

---

## 11. What is not claimed

Stated explicitly, because the absence of these claims is easy to miss:

- **Not** that the score predicts defects. Untested until §7.1 runs.
- **Not** that the weights are optimal. They are unmeasured priors.
- **Not** that scores compare across teams. Different trackers, conventions, and
  tier discipline make cross-team comparison meaningless today.
- **Not** that a high score means an item is a good idea. It means the reasoning is
  written down and something confirmed it.
- **Not** that any threshold (80/50/20, `--fail-below 50`) is calibrated.
- **Not** that the instrument measures certainty. It measures evidence sufficiency,
  which is a proxy for certainty of unknown quality (§7.2).

---

## 12. Rejected alternatives

### 12.1 Single ordinal certainty level (Fibonacci 0·1·3·5·8·13)

Rejected. Compresses to one number and loses *which* evidence is missing — and the
actionable output (`next`) depends entirely on knowing which. A level tells you
where you are; the signal breakdown tells you what to do.

### 12.2 Story points as the certainty quantity

Rejected. Story points estimate effort. Using them as the unit reproduces the
premise the instrument argues against. Retained only as `delivery_volume` (§6.1),
explicitly labelled as throughput.

### 12.3 A value-for-billing unit inside the instrument

Rejected. Once a score determines an invoice, it stops being a measurement and
becomes a negotiation. Keeping commercial units in a separate layer preserves the
score's only real asset: that no one has an incentive to argue with it.

### 12.4 Retrofitting kernel theory to the existing weights

Rejected on integrity grounds. It is possible to write a plausible theoretical
justification for 40/20/15/15/10 after the fact. Doing so would make the
specification *look* rigorous while adding no information, and the resulting
document could not be falsified by any measurement. §9 costs more and is worth
more.

### 12.5 Semantic (model-based) evaluation of AC and evidence

Rejected for now. It makes the score non-deterministic and non-auditable, and puts
a model in the position of grading model output — the precise circularity §4.7
defends against. Revisit only if structural proxies fail §10.3, and only with
cross-provider judging and a DEGRADED stamp when that is unavailable.

### 12.6 Fleiss' κ for a 3-rater panel

Rejected in favour of mean pairwise Cohen's κ with min pairwise reported (§7.1).
Fleiss obscures the single-disagreeing-rater case, which is the informative case
when raters may share a systematic blind spot.

---

## 13. Open questions

1. **Is 40 for validation right?** Only §9 answers it. Until then it is a guess.
2. **Should tier be auditable?** A PM-assigned, unaudited weight is a gaming
   surface (§5.1). Options: derive tier from item characteristics, require
   justification, or report distribution drift only.
3. **What is a healthy RCE?** Unknown without a baseline. Do not set a target first.
4. **Does the AC structural proxy hold?** §10.3 is the test.
5. **How should partial evidence be handled?** A linked PR that is closed unmerged
   currently counts the same as merged. Probably wrong.
6. **Cross-team normalisation** — currently disclaimed (§11). Is it recoverable, or
   is the score irreducibly team-relative?

---

## 14. Implementation status

| Component | Status |
|---|---|
| Five-signal score, breakdown, hints | **Implemented** — `computeScoreBreakdown` |
| Anti-circularity rules 1–3 | **Implemented** |
| Tier weighting and weighted average | **Implemented** |
| Levels, hill position, gaps, `next` | **Implemented** |
| History, deltas, certainty debt | **Implemented** |
| Sealed reveal, Spearman, research export | **Implemented, never run to completion** |
| Adapters: GitHub · Linear · Jira · Notion | **Implemented** |
| CI gate `--fail-below` | **Implemented** |
| Rename to `delivery_volume` (§6.1) | Specified |
| Confirmed-work debt variant (§6.2) | Specified |
| RCE (§6.3) | Specified |
| Gaming detection (§6.4) | Specified |
| CAD outer loop (§7.1) | Specified — highest value |
| F_risk gating (§8.1) | Specified |
| Per-item CI floor (§8.2) | Specified |

**Priority order for building.** §9 first — running the existing apparatus once
generates more information than any new feature. Then §7.1, then §6.3, then the
renames.

---

## 15. Provenance

- **v0.1** — non-empty checks for evidence; tier as additive points.
- **v0.2** — current shipped instrument. Tier moved from points to aggregation
  weight; evidence became component-wise; discussion became decision-based rather
  than comment-count; anti-circularity rules added. `INSTRUMENT_VERSION = '0.2.0'`,
  stamped into every report and export.
- **v0.3 (this document)** — first explicit specification. Adds the vocabulary
  ruling (§3), the rename in §6.1, and specifies RCE, CAD, F_risk, and gaming
  detection.

**External inputs.** RCE adapted from DORA / SPACE / Bosu et al. (2015). The
jagged-frontier framing behind CAD follows Dell'Acqua et al. (2023). The κ
methodology note in §7.1 follows Landis & Koch (1977) bands and standard practice
for small rater panels.

**A note on the CBM investigation.** A separate agent-run Design Science Research
project (`cbm-investigation`) explored an adjacent framework and produced an
extensive quantitative record. **None of its numbers are used here, and none should
be**: every result in that project came from agent-authored simulations with seeded
random generators, its rubrics were written by the agents that were graded against
them, and the same study reports mutually contradictory values for its headline
metrics. What it did contribute is real and is credited above: the instrument
specification discipline this document follows (construct · basis · formula · data
source · target · sensitivity · reliability · criterion validity · falsification
condition), the RCE construct, and the CAD outer-loop design. The distinction
between borrowing a construct and borrowing a result is the whole discipline.
