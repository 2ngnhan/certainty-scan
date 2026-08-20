// Certainty Score engine — instrument v0.3.
// 100 points per item across five signal groups (Chapter 3 of the study design):
//   Validation 40 · Workflow/dependencies 20 · Acceptance criteria 15 ·
//   Evidence 15 · Discussion 10
// The Tier is no longer additive points; it weights items during aggregation
// (basic 0.5 · intermediate 1.0 · advanced 2.0).
//
// Items must conform to the item shape: { validation_status, workflow_status,
// tier, estimate, evidence, acceptance_criteria, citation_count,
// description, labels, linked_evidence, dependencies, blocked, comments_text }

// 0.3.0 — scoring is unchanged from 0.2.0 (same five signals, same weights, same
// anti-circularity rules). The bump records a data-contract change: the vocabulary
// rename in docs/instrument-design.md §3.1 altered exported field names, the label
// convention, and the sealed envelope format. Two exports stamped with the same
// version must be reconcilable, so a schema change has to move the stamp.
export const INSTRUMENT_VERSION = '0.3.0'

export const DEFAULT_SIGNAL_MAXIMA = {
  signals: {
    validation: 40,
    workflow: 20,
    acceptance: 15,
    evidence: 15,
    discussion: 10,
  },
}

// ── Validation (max 40) ──────────────────────────────────────────────────────
// Anti-circularity rule 3: "validated" earns full credit only with linked
// evidence (merged PR, commit, test run, sign-off). Relabelling alone → 20.

function validationSignal(item) {
  const status = item.validation_status || 'unvalidated'
  if (status === 'validated') {
    return item.linked_evidence
      ? { points: 40, reason: 'validated with linked evidence' }
      : { points: 20, reason: 'labelled validated, no linked evidence' }
  }
  if (status === 'assumed') return { points: 10, reason: 'assumed' }
  return { points: 0, reason: status.replace(/_/g, ' ') }
}

// ── Workflow / dependencies (max 20) ─────────────────────────────────────────
// v0.2 reads the states of dependency-linked items: all dependencies done → 20,
// in progress → 10, any blocked (item or dependency) → 0. Items with no
// declared dependencies default to 10 and are flagged for PM review.

function workflowSignal(item) {
  const deps = item.dependencies ?? null
  const depBlocked = (deps ?? []).some(d => d.workflow_status === 'blocked')
  if (item.blocked || depBlocked || item.workflow_status === 'blocked') {
    return { points: 0, reason: item.blocked || item.workflow_status === 'blocked' ? 'blocked' : 'a dependency is blocked' }
  }
  // No carve-out for done items: the instrument reads dependency states only,
  // so even completed work without declared dependencies stays at the default.
  if (!deps || deps.length === 0) {
    return { points: 10, reason: 'no dependencies declared (flagged for PM review)' }
  }
  if (deps.every(d => d.workflow_status === 'done')) {
    return { points: 20, reason: `all ${deps.length} dependencies done` }
  }
  const open = deps.filter(d => d.workflow_status !== 'done').length
  return { points: 10, reason: `${open} of ${deps.length} dependencies still open` }
}

// ── Acceptance criteria (max 15) ─────────────────────────────────────────────
// Present and verifiable → 15, generic → 5, absent → 0. "Verifiable" means a
// tester could accept against it: two or more checklist/bullet/numbered lines,
// or Given/When/Then phrasing.

export function isVerifiableAC(text) {
  if (!text?.trim()) return false
  const lines = text.split('\n')
  const testable = lines.filter(l => /^\s*(?:[-*+]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s+)\S/.test(l))
  if (testable.length >= 2) return true
  const gherkin = ['given', 'when', 'then'].filter(k => new RegExp(`\\b${k}\\b`, 'i').test(text))
  return gherkin.length >= 2
}

function acceptanceSignal(item) {
  const ac = item.acceptance_criteria
  if (!ac?.trim()) return { points: 0, reason: 'none found' }
  return isVerifiableAC(ac)
    ? { points: 15, reason: 'present and verifiable' }
    : { points: 5, reason: 'present but generic' }
}

// ── Evidence (max 15 = 5 + 5 + 5) ────────────────────────────────────────────
// Structure of the description, component-wise: goals 5, how-to/guideline 5,
// dependency and collaboration notes 5. Replaces the v0.1 non-empty check.

const GOAL_RE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(goals?|objectives?|purpose|why|context|m[uụ]c\s*ti[êe]u|l[ýy]\s*do|b[ốô]i\s*c[ảa]nh)\b/im
const HOW_RE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(how|approach|steps?|plan|guidelines?|implementation|solution|c[áa]ch\s*l[àa]m|h[ưu][ớo]ng\s*d[ẫâ]n|gi[ảa]i\s*ph[áa]p|c[áa]c\s*b[ưu][ớo]c)\b/im
const DEP_NOTE_RE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(dependenc\w*|depends\s*on|blocked\s*by|coordination|collaborat\w*|ph[ụu]\s*thu[ộô]c|ph[ốô]i\s*h[ợơ]p)\b/im

// Description structure only: tracker dependency links belong to the Workflow
// signal and never double-count here, and an empty description earns zero.
export function evidenceComponents(item) {
  const text = item.description ?? item.evidence ?? ''
  return {
    goals: GOAL_RE.test(text),
    howto: HOW_RE.test(text),
    dependency_notes: DEP_NOTE_RE.test(text),
  }
}

function evidenceSignal(item) {
  const c = evidenceComponents(item)
  const points = (c.goals ? 5 : 0) + (c.howto ? 5 : 0) + (c.dependency_notes ? 5 : 0)
  const present = [c.goals && 'goals', c.howto && 'how-to', c.dependency_notes && 'dependency notes'].filter(Boolean)
  return { points, reason: present.length ? present.join(' + ') : 'unstructured or empty description' }
}

// ── Discussion (max 10) ──────────────────────────────────────────────────────
// Decision-based, deliberately not a comment count: recorded decision → 10,
// exchange without conclusion → 5, none → 0.

const DECISION_SECTION_RE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(decision|conclusion|resolution|k[ếe]t\s*lu[ậâ]n|quy[ếe]t\s*[đd][ịi]nh|ch[ốô]t)\b\s*[*:\s]/im
const DECISION_COMMENT_RE = /(^\s*(decision|conclusion|k[ếe]t\s*lu[ậâ]n|ch[ốô]t)\s*:|\b(decided|we\s+agreed|agreed\s+to|approved|sign(ed)?[- ]off|th[ốô]ng\s*nh[ấâ]t|ch[ốô]t\s+(l[àa]|ph[ưu][ơo]ng\s*[áa]n))\b)/im
const DECISION_LABELS = ['decision', 'decided', 'concluded', 'decision-recorded']

export function discussionState(item) {
  const labels = (item.labels ?? []).map(l => String(l).toLowerCase().trim())
  const comments = item.comments_text ?? []
  const hasDecision =
    labels.some(l => DECISION_LABELS.includes(l)) ||
    DECISION_SECTION_RE.test(item.description ?? '') ||
    comments.some(c => DECISION_COMMENT_RE.test(c))
  if (hasDecision) return 'decision'
  if ((item.citation_count ?? 0) > 0 || comments.length > 0) return 'exchange'
  return 'none'
}

function discussionSignal(item) {
  const state = discussionState(item)
  if (state === 'decision') return { points: 10, reason: 'recorded decision' }
  if (state === 'exchange') {
    const n = item.citation_count ?? item.comments_text?.length ?? 0
    return { points: 5, reason: `${n} comment${n === 1 ? '' : 's'}, no recorded conclusion` }
  }
  return { points: 0, reason: 'no discussion' }
}

// ── Anti-circularity rule 1 ──────────────────────────────────────────────────
// AI-generated documentation earns full Evidence and Acceptance Criteria credit
// only with a human confirmation signal (review label or linked evidence such
// as a merged PR). Without one, both signals are capped and the item is
// reported in the machine-generated, unconfirmed share of the backlog.

const AI_MARKER_RE = /(generated\s+(?:by|with)\s+(?:ai|claude|copilot|chatgpt|gpt|cursor|gemini|codex)|co-authored-by:\s*(?:claude|copilot|chatgpt)|🤖|\[ai[- ]generated\])/i
const AI_LABELS = ['ai-generated', 'ai_generated', 'machine-generated']
const REVIEW_LABELS = ['human-reviewed', 'reviewed', 'review:done']

export function isAIGenerated(item) {
  const labels = (item.labels ?? []).map(l => String(l).toLowerCase().trim())
  return AI_MARKER_RE.test(item.description ?? '') || labels.some(l => AI_LABELS.includes(l))
}

export function isHumanConfirmed(item) {
  const labels = (item.labels ?? []).map(l => String(l).toLowerCase().trim())
  return Boolean(item.linked_evidence) || labels.some(l => REVIEW_LABELS.includes(l))
}

function isUnconfirmedAI(item) {
  return isAIGenerated(item) && !isHumanConfirmed(item)
}

// ── Breakdown and score ──────────────────────────────────────────────────────
// Per-signal breakdown: points earned, max possible, why, and what would earn
// the rest. This is the single source of truth for the score.

export function computeScoreBreakdown(item) {
  const validation = validationSignal(item)
  const workflow = workflowSignal(item)
  const acceptance = acceptanceSignal(item)
  const evidence = evidenceSignal(item)
  const discussion = discussionSignal(item)

  // anti-circularity cap on machine-written documentation
  if (isUnconfirmedAI(item)) {
    if (acceptance.points > 5) {
      acceptance.points = 5
      acceptance.reason += ' (AI-generated, capped until human-confirmed)'
    }
    if (evidence.points > 5) {
      evidence.points = 5
      evidence.reason += ' (AI-generated, capped until human-confirmed)'
    }
  }

  return [
    {
      signal: 'validation', points: validation.points, max: 40,
      reason: validation.reason,
      hint: 'link the evidence (merged PR, test run, sign-off), then label it "validated"',
    },
    {
      signal: 'workflow', points: workflow.points, max: 20,
      reason: workflow.reason,
      hint: 'declare dependencies and unblock them',
    },
    {
      signal: 'acceptance criteria', points: acceptance.points, max: 15,
      reason: acceptance.reason,
      hint: 'add an "Acceptance Criteria" section with 2-3 testable bullets',
    },
    {
      signal: 'evidence', points: evidence.points, max: 15,
      reason: evidence.reason,
      hint: 'structure the description: goals, how-to, dependency notes',
    },
    {
      signal: 'discussion', points: discussion.points, max: 10,
      reason: discussion.reason,
      hint: 'record the conclusion on the item ("Decision: …"), not just back-and-forth',
    },
  ]
}

export function computeSignalScore(item) {
  const total = computeScoreBreakdown(item).reduce((sum, s) => sum + s.points, 0)
  return Math.min(total, 100)
}

export function computeCertaintyScore(item) {
  return computeSignalScore(item)
}

// Flags surfaced to the PM in the report and stamped into the research export.
export function computeItemFlags(item) {
  const flags = []
  const blocked = item.blocked || item.workflow_status === 'blocked' ||
    (item.dependencies ?? []).some(d => d.workflow_status === 'blocked')
  if (!blocked && !(item.dependencies?.length)) {
    flags.push('no_dependencies_declared')
  }
  if (isUnconfirmedAI(item)) flags.push('machine_generated_unconfirmed')
  return flags
}

// Score a fetched item list in place: score, breakdown, flags per item.
export function scoreItems(items) {
  for (const item of items) {
    item.certainty_breakdown = computeScoreBreakdown(item)
    item.certainty_score = Math.min(
      item.certainty_breakdown.reduce((s, x) => s + x.points, 0), 100)
    item.flags = computeItemFlags(item)
  }
  return items
}

// Largest missing signals first — "what would raise certainty on this item"
export function biggestGaps(item, limit = 3) {
  return computeScoreBreakdown(item)
    .map(s => ({ ...s, gap: s.max - s.points }))
    .filter(s => s.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
}

export function certaintyLevel(score) {
  if (score >= 80) return 'high'
  if (score >= 50) return 'medium'
  if (score >= 20) return 'low'
  return 'uncertain'
}

// Position on the Hill Chart's 1-9 reading scale (used in the delta view
// against the PM's 1-9 ratings; rank-order is what H1 compares).
export function hillPosition(score) {
  return Math.round((1 + (score / 100) * 8) * 10) / 10
}

// ── Tier: aggregation weights, not points ─────────────────────────────────
// Assigned by the PM via the three-question guideline; intermediate (1.0) is
// the default under missing information.

export const TIERS = [
  { value: 'basic',        label: 'Basic',        weight: 0.5 },
  { value: 'intermediate', label: 'Intermediate', weight: 1.0 },
  { value: 'advanced',     label: 'Advanced',     weight: 2.0 },
]

export function tierWeight(tier) {
  return TIERS.find(t => t.value === tier)?.weight ?? 1.0
}

export function computeMetrics(items) {
  const total = items.length
  const withTier = items.filter(i => i.tier)
  const completed = items.filter(i => i.workflow_status === 'done')
  const accepted = completed.filter(i => i.validation_status === 'validated')
  const totalEstimate = withTier.reduce((sum, i) => sum + (i.estimate || 1), 0)
  const completedEstimate = completed.filter(i => i.tier)
    .reduce((sum, i) => sum + (i.estimate || 1), 0)
  const scores = items.map(i => i.certainty_score || 0)
  const avgCertainty = total ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0

  // Aggregate certainty per the instrument: tier-weighted mean,
  // sum(score_i × w_i) / sum(100 × w_i), expressed as 0-100.
  const weightSum = items.reduce((s, i) => s + tierWeight(i.tier), 0)
  const weightedSum = items.reduce((s, i) => s + (i.certainty_score || 0) * tierWeight(i.tier), 0)
  const weightedAvg = weightSum ? Math.round(weightedSum / weightSum) : 0

  return {
    totalItems: total,
    tieredItems: withTier.length,
    totalEstimate,
    completedEstimate,
    completionRate: withTier.length
      ? Math.round((completed.filter(i => i.tier).length / withTier.length) * 100) : 0,
    integrityScore: completed.length ? Math.round((accepted.length / completed.length) * 100) : 0,
    avgCertaintyScore: avgCertainty,
    weightedAvgCertainty: weightedAvg,
    velocity: completedEstimate,
    uphill: items.filter(i => (i.certainty_score || 0) < 50).length,
    downhill: items.filter(i => (i.certainty_score || 0) >= 50).length,
    machineGeneratedUnconfirmed: items.filter(i => (i.flags ?? []).includes('machine_generated_unconfirmed')).length,
    noDependenciesDeclared: items.filter(i => (i.flags ?? []).includes('no_dependencies_declared')).length,
  }
}
