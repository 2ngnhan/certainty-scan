// v0.4 — gated hill state, and the counterexamples that motivated it.
// Every case here is reported in the specification (§4.9, Appendix A) with the
// same expected outcome, so the table and the code cannot drift apart.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSignalScore, computeHillState, crestGates, scoreItems, computeMetrics,
  isAIGenerated,
} from '../src/certainty.js'
import {
  detectEvidenceLinksInRepo, declaresNoDependencies, isBotLogin,
} from '../src/adapters/util.js'

const AC = '- returns 200 for a valid token\n- returns 401 for an expired token'
const DOC = '## Goal\nx\n## Approach\ny\n## Dependencies\nz'
const base = {
  labels: [], comments_text: [], citation_count: 0, linked_evidence: false,
  blocked: false, dependencies: null, workflow_status: 'in_progress',
  validation_status: 'unvalidated', description: DOC, acceptance_criteria: AC,
}

// ── Counterexamples: the score crosses 50, the gates must not ──────────────

test('CE1 blocked, relabelled validated, fully documented: score 50, stays uphill', () => {
  const it = { ...base, blocked: true, validation_status: 'validated' }
  assert.equal(computeSignalScore(it), 50)
  const h = computeHillState(it)
  assert.equal(h.state, 'uphill')
  assert.ok(h.failed_gates.includes('not_blocked'))
})

test('CE2 only an assumption, dependency open, decision recorded: score 60, stays uphill', () => {
  const it = { ...base, validation_status: 'assumed',
    dependencies: [{ workflow_status: 'in_progress' }],
    description: DOC + '\nDecision: go with plan A' }
  assert.equal(computeSignalScore(it), 60)
  const h = computeHillState(it)
  assert.equal(h.state, 'uphill')
  assert.deepEqual(h.failed_gates, ['dependencies_resolved'])
})

test('CE3 documented and resolved, never verified: crosses the crest, cannot be done_verified', () => {
  const it = { ...base, dependencies: [{ workflow_status: 'done' }],
    description: DOC + '\nDecision: go' }
  assert.equal(computeSignalScore(it), 60)
  assert.equal(computeHillState(it).state, 'executing')
  assert.equal(computeHillState({ ...it, workflow_status: 'done' }).state, 'done_unverified')
})

test('a done item is done_verified only with validation and linked evidence', () => {
  const done = { ...base, workflow_status: 'done', dependencies_declared_none: true }
  assert.equal(computeHillState(done).state, 'done_unverified')
  assert.equal(computeHillState({ ...done, validation_status: 'validated' }).state, 'done_unverified')
  assert.equal(computeHillState({ ...done, validation_status: 'validated', linked_evidence: true }).state, 'done_verified')
})

test('silence about dependencies is not resolution; an explicit "none" is', () => {
  const it = { ...base, description: DOC + '\nDecision: go' }
  assert.equal(crestGates(it).dependencies_resolved, false)
  assert.equal(crestGates({ ...it, dependencies_declared_none: true }).dependencies_resolved, true)
})

test('an explicit no-dependency declaration earns full workflow credit and clears the flag', () => {
  const [it] = scoreItems([{ ...base, dependencies_declared_none: true }])
  const wf = it.certainty_breakdown.find(s => s.signal === 'workflow')
  assert.equal(wf.points, 20)
  assert.ok(!it.flags.includes('no_dependencies_declared'))
})

test('declaresNoDependencies reads labels and EN/VI statement lines', () => {
  assert.ok(declaresNoDependencies('', ['no-dependencies']))
  assert.ok(declaresNoDependencies('Dependencies: none'))
  assert.ok(declaresNoDependencies('**Phụ thuộc:** không'))
  assert.ok(!declaresNoDependencies('Dependencies: see #12'))
  assert.ok(!declaresNoDependencies('no idea about dependencies'))
})

// ── Adversarial examples: what v0.4 does and does not stop ─────────────────

test('AE2 a link to another repository is not evidence (GitHub)', () => {
  assert.equal(detectEvidenceLinksInRepo('o/r', 'see https://github.com/foo/bar/pull/1'), false)
  assert.equal(detectEvidenceLinksInRepo('o/r', 'see https://github.com/o/r/pull/7'), true)
  assert.equal(detectEvidenceLinksInRepo('o/r', 'fixes #12'), true)
  assert.equal(detectEvidenceLinksInRepo('o/r', 'see https://gitlab.com/x/y/-/merge_requests/3'), false)
})

test('AE6 an issue opened by a bot is machine-authored and capped', () => {
  assert.ok(isBotLogin('renovate[bot]', 'Bot'))
  assert.ok(isBotLogin('dependabot[bot]'))
  assert.ok(!isBotLogin('ada', 'User'))
  const it = { ...base, author_is_bot: true, acceptance_criteria: AC }
  assert.ok(isAIGenerated(it))
  const [s] = scoreItems([it])
  assert.equal(s.certainty_breakdown.find(x => x.signal === 'acceptance criteria').points, 5)
  assert.ok(s.flags.includes('machine_generated_unconfirmed'))
})

test('known limit, AE1: two vacuous bullets still earn 15 (structural test)', () => {
  const [s] = scoreItems([{ ...base, acceptance_criteria: '- it works\n- it is good' }])
  assert.equal(s.certainty_breakdown.find(x => x.signal === 'acceptance criteria').points, 15)
})

test('known limit, AE3: a nominal sign-off still counts as a recorded decision', () => {
  const [s] = scoreItems([{ ...base, comments_text: ['LGTM, signed off'], citation_count: 1 }])
  assert.equal(s.certainty_breakdown.find(x => x.signal === 'discussion').points, 10)
})

// ── Aggregates follow the state, not the score ─────────────────────────────

test('uphill/downhill counts come from the gated state', () => {
  const items = scoreItems([
    { ...base, blocked: true, validation_status: 'validated' },            // 50, uphill
    { ...base, dependencies: [{ workflow_status: 'done' }], description: DOC + '\nDecision: go' }, // executing
    { ...base, workflow_status: 'done' },                                   // done_unverified
  ])
  const m = computeMetrics(items)
  assert.equal(m.uphill, 1)
  assert.equal(m.executing, 1)
  assert.equal(m.doneUnverified, 1)
  assert.equal(m.downhill, 2)
})
