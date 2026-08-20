// Snapshot history — persists per-item scores across syncs so a run can
// report what moved, not just where things stand.

import { readFileSync, writeFileSync, existsSync } from 'fs'

const MAX_SNAPSHOTS = 104 // two years of weekly syncs

export function loadHistory(path) {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // corrupt history should never block a sync
  }
}

export function appendSnapshot(path, history, items, avg, velocity = null) {
  const scores = {}
  for (const item of items) scores[item.external_id] = item.certainty_score ?? 0
  const snapshot = {
    date: new Date().toISOString(),
    avg,
    velocity,
    count: items.length,
    scores,
  }
  const next = [...history, snapshot].slice(-MAX_SNAPSHOTS)
  writeFileSync(path, JSON.stringify(next, null, 2))
  return snapshot
}

// Compare current items against the most recent snapshot.
// Returns null when there is no previous snapshot to compare against.
export function diffAgainstLast(history, items, avg, velocity = null) {
  const last = history[history.length - 1]
  if (!last) return null

  const moved = []
  for (const item of items) {
    const prev = last.scores[item.external_id]
    if (prev === undefined) continue
    const delta = (item.certainty_score ?? 0) - prev
    if (delta !== 0) moved.push({ item, prev, now: item.certainty_score ?? 0, delta })
  }

  // Certainty debt: output is accelerating while confidence is not keeping up.
  const hasVelocity = velocity != null && last.velocity != null
  const debt = hasVelocity && velocity > last.velocity && avg <= last.avg

  return {
    since: last.date,
    avgBefore: last.avg,
    avgNow: avg,
    avgDelta: avg - last.avg,
    velocityBefore: hasVelocity ? last.velocity : null,
    velocityNow: hasVelocity ? velocity : null,
    debt,
    drops: moved.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta),
    rises: moved.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta),
    newItems: items.filter(i => last.scores[i.external_id] === undefined).length,
  }
}
