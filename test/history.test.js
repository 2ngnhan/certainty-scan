import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadHistory, appendSnapshot, diffAgainstLast } from '../src/history.js'

function tmpPath() {
  return join(mkdtempSync(join(tmpdir(), 'certainty-test-')), 'history.json')
}

test('loadHistory returns [] for missing or corrupt files', () => {
  assert.deepEqual(loadHistory(tmpPath()), [])
  const path = tmpPath()
  writeFileSync(path, 'not json{{')
  assert.deepEqual(loadHistory(path), [])
})

test('appendSnapshot persists per-item scores and rereads', () => {
  const path = tmpPath()
  const items = [{ external_id: 'A-1', certainty_score: 40 }]
  appendSnapshot(path, [], items, 40)
  const history = loadHistory(path)
  assert.equal(history.length, 1)
  assert.equal(history[0].scores['A-1'], 40)
  assert.equal(history[0].avg, 40)
})

test('diffAgainstLast reports drops, rises, and new items', () => {
  const history = [{ date: '2026-06-01T00:00:00Z', avg: 50, scores: { 'A-1': 40, 'A-2': 80 } }]
  const items = [
    { external_id: 'A-1', certainty_score: 10 },
    { external_id: 'A-2', certainty_score: 95 },
    { external_id: 'A-3', certainty_score: 20 },
  ]
  const diff = diffAgainstLast(history, items, 42)
  assert.equal(diff.avgDelta, -8)
  assert.equal(diff.drops.length, 1)
  assert.equal(diff.drops[0].delta, -30)
  assert.equal(diff.rises[0].delta, 15)
  assert.equal(diff.newItems, 1)
})

test('diffAgainstLast returns null with no prior snapshot', () => {
  assert.equal(diffAgainstLast([], [], 0), null)
})

test('certainty debt flags rising velocity with flat or falling certainty', () => {
  const base = { date: '2026-06-01T00:00:00Z', scores: {} }
  const items = []
  const debt = diffAgainstLast([{ ...base, avg: 56, velocity: 12 }], items, 54, 18)
  assert.equal(debt.debt, true)
  assert.equal(debt.velocityBefore, 12)
  assert.equal(debt.velocityNow, 18)

  const healthy = diffAgainstLast([{ ...base, avg: 56, velocity: 12 }], items, 60, 18)
  assert.equal(healthy.debt, false, 'certainty rising with velocity is not debt')

  const legacy = diffAgainstLast([{ ...base, avg: 56 }], items, 54, 18)
  assert.equal(legacy.debt, false, 'old snapshots without velocity never flag debt')
})
