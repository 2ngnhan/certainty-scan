import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getField, applyMap, mergeFieldMap,
  extractAcceptanceCriteria, validationFromLabels, tierFromLabels,
  blockedFromLabels, detectEvidenceLinks, parseDependencyRefs,
} from '../src/adapters/util.js'

test('getField walks dot paths and tolerates gaps', () => {
  assert.equal(getField({ a: { b: { c: 1 } } }, 'a.b.c'), 1)
  assert.equal(getField({ a: {} }, 'a.b.c'), undefined)
})

test('applyMap falls back to default for unmapped values', () => {
  const def = { field: 'state.type', map: { completed: 'validated' }, default: 'unvalidated' }
  assert.equal(applyMap({ state: { type: 'completed' } }, def), 'validated')
  assert.equal(applyMap({ state: { type: 'weird' } }, def), 'unvalidated')
})

test('mergeFieldMap deep-merges user overrides over defaults', () => {
  const defaults = { v: { field: 'x', map: { a: 1 }, default: null } }
  const merged = mergeFieldMap(defaults, { v: { map: { b: 2 } } })
  assert.deepEqual(merged.v, { field: 'x', map: { a: 1, b: 2 }, default: null })
})

test('mergeFieldMap passes through non-map field defs (notion style)', () => {
  const merged = mergeFieldMap({ title_field: { field: 'Name' } }, { title_field: { field: 'Title' } })
  assert.deepEqual(merged.title_field, { field: 'Title' })
})

test('acceptance criteria: markdown heading', () => {
  const text = 'Intro\n## Acceptance Criteria\n- mobile works\n- audit passes\n## Notes\nother'
  assert.equal(extractAcceptanceCriteria(text), '- mobile works\n- audit passes')
})

test('acceptance criteria: bold heading and plain "Acceptance criteria:" line', () => {
  assert.equal(extractAcceptanceCriteria('**Acceptance Criteria**\ndone when X'), 'done when X')
  assert.equal(extractAcceptanceCriteria('Acceptance criteria:\ndone when Y'), 'done when Y')
})

test('acceptance criteria: checklist fallback', () => {
  assert.equal(extractAcceptanceCriteria('Blah\n- [ ] one\n- [x] two'), '- [ ] one\n- [x] two')
})

test('acceptance criteria: none found', () => {
  assert.equal(extractAcceptanceCriteria('just words'), null)
  assert.equal(extractAcceptanceCriteria(''), null)
  assert.equal(extractAcceptanceCriteria(null), null)
})

test('validation labels are case-insensitive', () => {
  assert.equal(validationFromLabels(['Bug', 'Validated']), 'validated')
  assert.equal(validationFromLabels(['needs-clarification']), 'needs_clarification')
  assert.equal(validationFromLabels(['bug']), null)
  assert.equal(validationFromLabels([]), null)
})

test('cu tier labels', () => {
  assert.equal(tierFromLabels(['Certainty:Advanced']), 'advanced')
  assert.equal(tierFromLabels(['certainty:basic']), 'basic')
  assert.equal(tierFromLabels(['priority']), null)
})

test('blocked labels', () => {
  assert.equal(blockedFromLabels(['Blocked']), true)
  assert.equal(blockedFromLabels(['status: blocked']), true)
  assert.equal(blockedFromLabels(['unblocked', 'bug']), false)
})

test('evidence links: PR/commit URLs and closing keywords', () => {
  assert.equal(detectEvidenceLinks('see https://github.com/o/r/pull/12'), true)
  assert.equal(detectEvidenceLinks('deployed in https://github.com/o/r/commit/abc123'), true)
  assert.equal(detectEvidenceLinks('this fixes #42'), true)
  assert.equal(detectEvidenceLinks('no links here', null, ''), false)
  assert.equal(detectEvidenceLinks('body text', 'comment with https://gitlab.com/o/r/-/merge_requests/3'), true)
})

test('dependency declarations parse from free text', () => {
  assert.deepEqual(parseDependencyRefs('Depends on #12 and #14'), ['#12', '#14'])
  assert.deepEqual(parseDependencyRefs('blocked by ENG-42'), ['ENG-42'])
  assert.deepEqual(parseDependencyRefs('blocked by eng-42'), ['ENG-42'], 'lowercase keys normalize to the tracker form')
  assert.deepEqual(parseDependencyRefs('phụ thuộc vào #7'), ['#7'])
  assert.deepEqual(parseDependencyRefs('mentions #12 casually'), [], 'a bare reference is not a declaration')
  assert.deepEqual(parseDependencyRefs('Depends on #12\nENG-4 does something else'), ['#12'],
    'a declaration never swallows refs across a newline')
  assert.deepEqual(parseDependencyRefs(''), [])
})

test('evidence links: past-tense closing keywords count too', () => {
  assert.equal(detectEvidenceLinks('fixed #42 yesterday'), true)
  assert.equal(detectEvidenceLinks('closed #12 via deploy'), true)
})
