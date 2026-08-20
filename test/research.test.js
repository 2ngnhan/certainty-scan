import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateKey, seal, unseal, hashTitle, spearman,
  buildResearchExport, generateRatingSheetHTML, applyRatings,
} from '../src/research.js'
import { scoreItems } from '../src/certainty.js'

function item(id, over = {}) {
  return {
    external_id: id, title: `Secret feature ${id}`, url: `https://x/${id}`,
    description: 'plain text', acceptance_criteria: null,
    validation_status: 'unvalidated', workflow_status: 'todo',
    tier: null, estimate: 1, citation_count: 0, labels: [],
    assignee: 'Ada Lovelace', source: 'github',
    created_at: '2026-01-01', updated_at: '2026-01-02', ...over,
  }
}

test('seal/unseal round-trips the payload; the envelope carries no scores', () => {
  const items = scoreItems([item('A'), item('B', { validation_status: 'assumed' })])
  const key = generateKey()
  const envelope = seal({ items, meta: { projectName: 'P' } }, key, { pairId: 'PAIR-1', mode: 'active' })

  assert.ok(!envelope.includes('certainty_score'), 'the sealed file is opaque')
  assert.ok(!envelope.includes('Secret feature'), 'titles are encrypted too')
  assert.match(envelope, /"pair_id": "PAIR-1"/)

  const { payload, envelope: env } = unseal(envelope, key)
  assert.equal(payload.items.length, 2)
  assert.equal(payload.items[0].title, 'Secret feature A')
  assert.equal(env.mode, 'active')
})

test('unseal rejects a wrong key', () => {
  const envelope = seal({ x: 1 }, generateKey(), {})
  assert.throws(() => unseal(envelope, generateKey()), /wrong key/)
})

test('title hashing is deterministic, short, and salted by pair', () => {
  assert.equal(hashTitle('Build login', 'PAIR-1'), hashTitle('Build login', 'PAIR-1'))
  assert.notEqual(hashTitle('Build login', 'PAIR-1'), hashTitle('Build logout', 'PAIR-1'))
  assert.notEqual(hashTitle('Build login', 'PAIR-1'), hashTitle('Build login', 'PAIR-2'),
    'without the pair id a dictionary cannot confirm titles')
  assert.equal(hashTitle('x').length, 16)
})

test('tampering with sealed envelope metadata is detected', () => {
  const key = generateKey()
  const envelope = JSON.parse(seal({ x: 1 }, key, { pairId: 'PAIR-1', mode: 'active' }))
  envelope.mode = 'retrospective'
  assert.throws(() => unseal(JSON.stringify(envelope), key), /tampered/)
})

test('the research export is anonymized: no titles, names, URLs, or descriptions', () => {
  const items = scoreItems([item('A', { pm_rating: 7 }), item('B')])
  const exp = buildResearchExport(items, { pairId: 'PAIR-1', consent: true, mode: 'active' })
  const json = JSON.stringify(exp)

  assert.ok(!json.includes('Secret feature'), 'no raw titles')
  assert.ok(!json.includes('Ada'), 'no assignee names')
  assert.ok(!json.includes('https://x/'), 'no URLs')
  assert.ok(!json.includes('plain text'), 'no description bodies')

  assert.equal(exp.items.length, 2)
  assert.equal(exp.items[0].item_id, 'A')
  assert.equal(exp.items[0].title_hash.length, 16)
  assert.equal(typeof exp.items[0].signals.validation, 'number')
  assert.equal(typeof exp.items[0].description_length, 'number', 'H3 readability fields present')
  assert.equal(exp.has_rating, true)
  assert.equal(exp.consent, true)
  assert.match(exp.instrument_version, /^0\.3\./)
})

test('spearman: monotonic 1, inverse -1, null when n < 3, ties tolerated', () => {
  assert.equal(spearman([[10, 1], [20, 2], [30, 3]]), 1)
  assert.equal(spearman([[10, 3], [20, 2], [30, 1]]), -1)
  assert.equal(spearman([[1, 1], [2, 2]]), null)
  assert.equal(spearman([[5, 5], [5, 5], [5, 5]]), null, 'no variance, no correlation')
  const rho = spearman([[10, 2], [10, 1], [30, 3], [40, 4]])
  assert.ok(rho > 0 && rho <= 1)
})

test('applyRatings merges PM ratings and lets the PM tier take over aggregation', () => {
  const items = scoreItems([
    item('A', { tier: 'basic' }),
    item('B', { validation_status: 'validated', linked_evidence: true }),
    item('C'),
  ])
  const rating = {
    format: 'certainty-rating', pair_id: 'PAIR-1',
    items: [
      { id: 'A', certainty: 2, tier: 'advanced', adverse: [true, true, false] },
      { id: 'B', certainty: 6, tier: 'intermediate', adverse: [false, true, false] },
    ],
  }
  const result = applyRatings(items, rating)
  assert.equal(result.matched, 2)
  assert.equal(result.rated, 2)
  assert.equal(result.spearman.n, 2)
  assert.equal(items[0].pm_rating, 2)
  assert.equal(items[0].tier, 'advanced', 'the PM-assigned tier is the instrument tier')
  assert.equal(items[0].tracker_tier, 'basic', 'the tracker tier is kept for reference')
  assert.equal(items[2].pm_rating, undefined, 'unrated items are untouched')
})

test('the rating sheet lists items but never a score, and calls no network', () => {
  const items = scoreItems([item('A', { title: 'Login flow <script>' }), item('B')])
  // make the score distinctive so a leak would be detectable
  items[0].certainty_score = 87
  const html = generateRatingSheetHTML(items, { pairId: 'PAIR-1' })

  assert.match(html, /Login flow &lt;script&gt;/, 'titles are shown, escaped')
  assert.match(html, /PAIR-1/)
  assert.ok(!html.includes('certainty_score'))
  assert.ok(!/\b87\b/.test(html), 'no machine score leaks into the sheet')
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(html), 'the sheet is offline-only')
  assert.match(html, /rating\.json/)
  assert.match(html, /1 đến 9|1-9/, 'the 1-9 scale is explained')
})
