import test from 'node:test'
import assert from 'node:assert/strict'
import { generateHillChartSVG, generateHTML } from '../src/report.js'
import { computeMetrics } from '../src/certainty.js'

function item(id, score, over = {}) {
  return { external_id: id, title: `Item ${id}`, url: '#', certainty_score: score, workflow_status: 'todo', ...over }
}

test('hill chart plots one dot per item, capped per bucket', () => {
  const items = [item('A', 10), item('B', 30), item('C', 90)]
  const svg = generateHillChartSVG(items, computeMetrics(items))
  assert.equal((svg.match(/<circle/g) || []).length, 3 + 4, '3 items + 4 legend dots')
  assert.match(svg, /Peak certainty/)
  assert.match(svg, /Discovery/)
  assert.match(svg, /Execution/)
})

test('hill chart caps crowded buckets with a +n label', () => {
  const items = Array.from({ length: 12 }, (_, i) => item(`B-${i}`, 0))
  const svg = generateHillChartSVG(items, computeMetrics(items))
  assert.equal((svg.match(/<circle/g) || []).length, 8 + 4, 'max 8 stacked + legend')
  assert.match(svg, />\+4</)
})

test('hill chart escapes item titles in tooltips', () => {
  const items = [item('X', 50, { title: 'a <script> "quote"' })]
  const svg = generateHillChartSVG(items, computeMetrics(items))
  assert.ok(!svg.includes('<script>'))
  assert.match(svg, /a &lt;script&gt;/)
})

test('generateHTML embeds the hill chart and Propozel pointer', () => {
  const html = generateHTML([item('A', 42)], 'P')
  assert.match(html, /<svg[^>]+Hill chart/)
  assert.match(html, /propozel\.com/)
  assert.match(html, /instrument v0\.3/, 'the instrument version is stamped')
})

test('delta view renders when PM ratings are present, with Spearman', () => {
  const items = [
    item('A', 90, { pm_rating: 3 }),   // machine 8.2 vs PM 3: big delta, highlighted
    item('B', 50, { pm_rating: 5 }),   // machine 5 vs PM 5: no highlight
    item('C', 30),
  ]
  const html = generateHTML(items, 'P', { research: { pairId: 'PAIR-1', spearman: { rho: 0.5, n: 2 } } })
  assert.match(html, /Delta view/)
  assert.match(html, /Spearman/)
  assert.match(html, /0\.5/)
  assert.match(html, /pair PAIR-1/)
  assert.ok(html.indexOf('>A<') < html.indexOf('>B<') || html.indexOf('#') !== -1, 'largest gap first')
})

test('no delta view without ratings', () => {
  const html = generateHTML([item('A', 42)], 'P')
  assert.ok(!html.includes('Delta view'))
})
