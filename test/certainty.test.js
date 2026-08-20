import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSignalScore, computeScoreBreakdown, computeCertaintyScore,
  certaintyLevel, biggestGaps, computeMetrics, computeItemFlags, scoreItems,
  tierWeight, hillPosition, isVerifiableAC, DEFAULT_SIGNAL_MAXIMA, INSTRUMENT_VERSION,
} from '../src/certainty.js'

const fullItem = {
  validation_status: 'validated',
  linked_evidence: true,
  workflow_status: 'done',
  dependencies: [{ external_id: '#5', workflow_status: 'done' }],
  acceptance_criteria: '- [ ] mobile works\n- [ ] audit passes',
  description: '## Goal\nship it\n## Approach\nsteps here\n## Dependencies\nneeds #5',
  comments_text: ['Decision: go with option B'],
  citation_count: 1,
}

const emptyItem = {
  validation_status: 'unvalidated',
  workflow_status: 'todo',
  tier: null,
  description: '',
  acceptance_criteria: null,
  citation_count: 0,
}

test('instrument version is stamped as 0.3.x', () => {
  assert.match(INSTRUMENT_VERSION, /^0\.3\./)
})

test('signal maxes sum to 100 and match the published config', () => {
  const total = computeScoreBreakdown(emptyItem).reduce((s, x) => s + x.max, 0)
  assert.equal(total, 100)
  assert.deepEqual(DEFAULT_SIGNAL_MAXIMA.signals,
    { validation: 40, workflow: 20, acceptance: 15, evidence: 15, discussion: 10 })
})

test('a fully-signaled item scores exactly 100', () => {
  assert.equal(computeSignalScore(fullItem), 100)
})

test('an empty open item scores 10: undeclared dependencies default to 10 and are flagged', () => {
  assert.equal(computeSignalScore(emptyItem), 10)
  assert.ok(computeItemFlags(emptyItem).includes('no_dependencies_declared'))
})

test('validation ladder: linked evidence 40, label only 20, assumed 10, else 0', () => {
  const v = item => computeScoreBreakdown(item).find(s => s.signal === 'validation').points
  assert.equal(v({ ...emptyItem, validation_status: 'validated', linked_evidence: true }), 40)
  assert.equal(v({ ...emptyItem, validation_status: 'validated' }), 20, 'relabelling alone never earns full credit')
  assert.equal(v({ ...emptyItem, validation_status: 'assumed' }), 10)
  assert.equal(v({ ...emptyItem, validation_status: 'needs_clarification' }), 0)
  assert.equal(v(emptyItem), 0)
})

test('workflow reads dependency states: all done 20, open 10, any blocked 0', () => {
  const w = item => computeScoreBreakdown(item).find(s => s.signal === 'workflow').points
  const deps = statuses => statuses.map((s, i) => ({ external_id: `#${i}`, workflow_status: s }))
  assert.equal(w({ ...emptyItem, dependencies: deps(['done', 'done']) }), 20)
  assert.equal(w({ ...emptyItem, dependencies: deps(['done', 'in_progress']) }), 10)
  assert.equal(w({ ...emptyItem, dependencies: deps(['done', 'blocked']) }), 0, 'a blocked dependency zeroes the signal')
  assert.equal(w({ ...emptyItem, blocked: true }), 0, 'a blocked item zeroes the signal')
  assert.equal(w({ ...emptyItem, workflow_status: 'blocked' }), 0)
  assert.equal(w({ ...emptyItem, workflow_status: 'done' }), 10,
    'no carve-out for done items: without declared dependencies they stay at the default')
  assert.equal(w({ ...emptyItem, workflow_status: 'done', dependencies: deps(['done']) }), 20)
  assert.equal(w(emptyItem), 10, 'no declared dependencies defaults to 10')
})

test('done items without declared dependencies are still flagged for PM review', () => {
  assert.ok(computeItemFlags({ ...emptyItem, workflow_status: 'done' }).includes('no_dependencies_declared'))
})

test('acceptance criteria: verifiable 15, generic 5, absent 0', () => {
  const a = item => computeScoreBreakdown(item).find(s => s.signal === 'acceptance criteria').points
  assert.equal(a({ ...emptyItem, acceptance_criteria: '- [ ] one\n- [ ] two' }), 15)
  assert.equal(a({ ...emptyItem, acceptance_criteria: '1. first\n2. second' }), 15)
  assert.equal(a({ ...emptyItem, acceptance_criteria: 'Given a user When they click Then it saves' }), 15)
  assert.equal(a({ ...emptyItem, acceptance_criteria: 'should work well' }), 5, 'present but a tester cannot accept against it')
  assert.equal(a(emptyItem), 0)
  assert.equal(isVerifiableAC(null), false)
})

test('evidence scores component-wise: goals 5 + how-to 5 + dependency notes 5', () => {
  const e = item => computeScoreBreakdown(item).find(s => s.signal === 'evidence').points
  assert.equal(e({ ...emptyItem, description: '## Goal\nship' }), 5)
  assert.equal(e({ ...emptyItem, description: '## Goal\nship\n## Approach\nsteps' }), 10)
  assert.equal(e({ ...emptyItem, description: 'Mục tiêu: giao hàng\nCách làm: từng bước\nPhụ thuộc: đội API' }), 15, 'Vietnamese headings count')
  assert.equal(e({ ...emptyItem, description: 'just some prose' }), 0, 'unstructured text earns nothing')
  assert.equal(e({ ...emptyItem, dependencies: [{ external_id: '#1', workflow_status: 'done' }] }), 0,
    'tracker dependency links are the workflow signal, not description structure; an empty description earns zero')
})

test('discussion is decision-based: recorded decision 10, exchange 5, none 0', () => {
  const d = item => computeScoreBreakdown(item).find(s => s.signal === 'discussion').points
  assert.equal(d({ ...emptyItem, comments_text: ['Decision: ship it'] }), 10)
  assert.equal(d({ ...emptyItem, description: '## Decision\nwe go with B' }), 10)
  assert.equal(d({ ...emptyItem, labels: ['decision'] , citation_count: 0 }), 10)
  assert.equal(d({ ...emptyItem, citation_count: 7 }), 5, 'comment volume without a conclusion never exceeds 5')
  assert.equal(d({ ...emptyItem, description: 'we need a decision soon' }), 0, 'mentioning the word is not recording one')
  assert.equal(d(emptyItem), 0)
})

test('anti-circularity: unconfirmed AI documentation caps AC and evidence, and is flagged', () => {
  const ai = {
    ...emptyItem,
    description: 'Generated with Copilot\n## Goal\nship\n## Approach\nsteps\n## Dependencies\nneeds X',
    acceptance_criteria: '- [ ] one\n- [ ] two',
  }
  const b = computeScoreBreakdown(ai)
  assert.equal(b.find(s => s.signal === 'acceptance criteria').points, 5)
  assert.equal(b.find(s => s.signal === 'evidence').points, 5)
  assert.ok(computeItemFlags(ai).includes('machine_generated_unconfirmed'))

  const confirmed = { ...ai, linked_evidence: true }
  const cb = computeScoreBreakdown(confirmed)
  assert.equal(cb.find(s => s.signal === 'acceptance criteria').points, 15, 'a human confirmation signal lifts the cap')
  assert.equal(cb.find(s => s.signal === 'evidence').points, 15)
  assert.ok(!computeItemFlags(confirmed).includes('machine_generated_unconfirmed'))
})

test('tier is an aggregation weight (0.5 / 1.0 / 2.0), not points', () => {
  assert.equal(tierWeight('basic'), 0.5)
  assert.equal(tierWeight('intermediate'), 1.0)
  assert.equal(tierWeight('advanced'), 2.0)
  assert.equal(tierWeight(null), 1.0, 'intermediate is the default under missing information')
  assert.ok(!computeScoreBreakdown({ ...emptyItem, tier: 'advanced' }).some(s => /tier/i.test(s.signal)))
})

test('aggregate certainty is the tier-weighted mean', () => {
  const items = [
    { certainty_score: 100, tier: 'advanced', workflow_status: 'todo' },
    { certainty_score: 0, tier: 'basic', workflow_status: 'todo' },
  ]
  const m = computeMetrics(items)
  assert.equal(m.weightedAvgCertainty, 80, '(100×2 + 0×0.5) / 2.5')
  assert.equal(m.avgCertaintyScore, 50)
})

test('certaintyLevel thresholds', () => {
  assert.equal(certaintyLevel(80), 'high')
  assert.equal(certaintyLevel(79), 'medium')
  assert.equal(certaintyLevel(50), 'medium')
  assert.equal(certaintyLevel(49), 'low')
  assert.equal(certaintyLevel(20), 'low')
  assert.equal(certaintyLevel(19), 'uncertain')
})

test('hillPosition maps 0-100 onto the 1-9 hill scale', () => {
  assert.equal(hillPosition(0), 1)
  assert.equal(hillPosition(50), 5)
  assert.equal(hillPosition(100), 9)
})

test('biggestGaps sorts by missing points and excludes earned signals', () => {
  const gaps = biggestGaps(emptyItem)
  assert.equal(gaps[0].signal, 'validation')
  assert.equal(gaps[0].gap, 40)
  assert.equal(gaps.length, 3)
  assert.deepEqual(biggestGaps(fullItem), [])
})

test('scoreItems stamps score, breakdown, and flags on every item', () => {
  const items = scoreItems([{ ...emptyItem }, { ...fullItem }])
  assert.equal(items[0].certainty_score, 10)
  assert.equal(items[1].certainty_score, 100)
  assert.ok(Array.isArray(items[0].certainty_breakdown))
  assert.deepEqual(items[0].flags, ['no_dependencies_declared'])
})

test('computeMetrics counts uphill/downhill and surfaces instrument flags', () => {
  const items = scoreItems([
    { ...emptyItem },
    { ...fullItem, tier: 'basic' },
    { ...emptyItem, description: 'Generated with Copilot', acceptance_criteria: '- [ ] a\n- [ ] b' },
  ])
  const m = computeMetrics(items)
  assert.equal(m.uphill, 2)
  assert.equal(m.downhill, 1)
  assert.equal(m.totalItems, 3)
  assert.equal(m.integrityScore, 100)
  assert.equal(m.noDependenciesDeclared, 2)
  assert.equal(m.machineGeneratedUnconfirmed, 1)
})
