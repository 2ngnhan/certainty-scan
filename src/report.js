import { certaintyLevel, computeMetrics, biggestGaps, hillPosition, INSTRUMENT_VERSION } from './certainty.js'

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function levelColor(score) {
  if (score >= 80) return '#24a148'
  if (score >= 50) return '#0f62fe'
  if (score >= 20) return '#f1c21b'
  return '#da1e28'
}

function bar(score, breakdown) {
  const color = levelColor(score)
  const tooltip = breakdown
    ? esc(breakdown.map(s => `${s.signal}: ${s.points}/${s.max} (${s.reason})`).join('\n'))
    : ''
  return `<div style="display:flex;align-items:center;gap:8px"${tooltip ? ` title="${tooltip}"` : ''}>
    <div style="flex:1;background:#e0e0e0;border-radius:2px;height:6px">
      <div style="width:${score}%;background:${color};height:6px;border-radius:2px"></div>
    </div>
    <span style="font-size:12px;min-width:32px;text-align:right;color:${color};font-weight:600">${score}</span>
  </div>`
}

function metricBox(label, value, sub = '') {
  return `<div style="background:#f4f4f4;border-radius:4px;padding:16px 20px;min-width:130px">
    <div style="font-size:28px;font-weight:700;color:#161616">${value}</div>
    <div style="font-size:12px;color:#525252;margin-top:2px">${label}</div>
    ${sub ? `<div style="font-size:11px;color:#8d8d8d;margin-top:2px">${sub}</div>` : ''}
  </div>`
}

function itemRow(item) {
  const score = item.certainty_score ?? 0
  const level = certaintyLevel(score)
  const tierBadge = item.tier
    ? `<span style="font-size:10px;background:#e0e0e0;padding:2px 6px;border-radius:10px;margin-left:6px">${item.tier}</span>`
    : ''
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0">
      <a href="${esc(item.url) || '#'}" target="_blank" style="color:#0f62fe;text-decoration:none;font-size:13px">${esc(item.external_id)}</a>
    </td>
    <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;font-size:13px;max-width:320px">
      ${esc(item.title)}${tierBadge}
    </td>
    <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#525252">${esc(item.workflow_status)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#525252">${esc(item.validation_status)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;width:160px">${bar(score, item.certainty_breakdown)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#525252;text-align:center">
      <span style="color:${levelColor(score)};font-weight:600">${level}</span>
    </td>
  </tr>`
}

function needsAttention(items) {
  const risky = items
    .filter(i => i.workflow_status !== 'done' && (i.certainty_score ?? 0) < 50)
    .sort((a, b) => (a.certainty_score ?? 0) - (b.certainty_score ?? 0))
    .slice(0, 5)
  if (!risky.length) return ''

  const rows = risky.map(i => {
    const gaps = biggestGaps(i)
      .map(g => `<span style="white-space:nowrap">${esc(g.hint)} <b>+${g.gap}</b></span>`)
      .join(' &middot; ')
    return `<div style="display:flex;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid #e0e0e0">
      <span style="color:${levelColor(i.certainty_score ?? 0)};font-weight:700;min-width:40px">${i.certainty_score ?? 0}%</span>
      <a href="${esc(i.url) || '#'}" target="_blank" style="color:#0f62fe;text-decoration:none;font-size:13px">${esc(i.external_id)}</a>
      <span style="font-size:13px;flex:1">${esc(i.title)}</span>
      <span style="font-size:12px;color:#525252">${gaps}</span>
    </div>`
  })

  return `<h2>Needs attention &mdash; least certain open items</h2>
  <div style="background:#fff;border:1px solid #e0e0e0;border-radius:4px;padding:8px 16px;margin-bottom:32px">
    ${rows.join('\n')}
  </div>`
}

// Delta view — the H1 moment: machine score next to the PM's independent
// rating, both on the Hill Chart's 1-9 reading scale, largest gaps first.
function deltaView(items, research = {}) {
  const rated = items.filter(i => i.pm_rating != null)
  if (!rated.length) return ''

  const rows = rated
    .map(i => ({ item: i, machine: hillPosition(i.certainty_score ?? 0), pm: i.pm_rating }))
    .map(r => ({ ...r, delta: Math.round((r.machine - r.pm) * 10) / 10 }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map(({ item, machine, pm, delta }) => {
      const big = Math.abs(delta) >= 2
      return `<tr${big ? ' style="background:#fff1f1"' : ''}>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px"><a href="${esc(item.url) || '#'}" target="_blank" style="color:#0f62fe;text-decoration:none">${esc(item.external_id)}</a></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:13px;max-width:340px">${esc(item.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;font-size:13px">${item.certainty_score ?? 0} <span style="color:#8d8d8d;font-size:11px">(${machine}/9)</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;font-size:13px">${pm}/9</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;font-weight:600;color:${big ? '#da1e28' : '#525252'}">${delta > 0 ? '+' : ''}${delta}</td>
    </tr>`
    })

  const sp = research.spearman
  const spLine = sp?.rho != null
    ? `Spearman &rho; = <b>${sp.rho}</b> (n = ${sp.n} items rated by the PM before the reveal).`
    : `${rated.length} items rated by the PM before the reveal.`

  return `<h2>Delta view &mdash; machine vs PM</h2>
  <p style="font-size:12px;color:#525252;margin:-8px 0 12px">
    ${spLine} Rows in red differ by 2+ points on the 1-9 hill scale: those gaps are the most valuable
    conversation of the walkthrough, not anyone's mistake.
  </p>
  <table style="margin-bottom:32px">
    <thead><tr>
      <th>ID</th><th>Title</th><th>Machine</th><th>PM rating</th><th>&Delta;</th>
    </tr></thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>`
}

// Items the instrument flags for the PM: dependencies not declared (workflow
// signal defaulted) and machine-generated docs awaiting human confirmation.
function flagNotes(metrics) {
  const notes = []
  if (metrics.noDependenciesDeclared) {
    notes.push(`${metrics.noDependenciesDeclared} open item${metrics.noDependenciesDeclared === 1 ? '' : 's'} declare no dependencies (workflow signal defaulted to 10, flagged for PM review)`)
  }
  if (metrics.machineGeneratedUnconfirmed) {
    notes.push(`${metrics.machineGeneratedUnconfirmed} item${metrics.machineGeneratedUnconfirmed === 1 ? '' : 's'} look machine-generated without a human confirmation signal (acceptance criteria and evidence credit capped)`)
  }
  if (!notes.length) return ''
  return `<div style="border:1px solid #e0e0e0;border-left:4px solid #f1c21b;padding:10px 16px;font-size:12px;color:#525252;margin-bottom:32px">
    ${notes.join('<br>')}
  </div>`
}

// Hill chart — the Propozel visualization, as static inline SVG.
// Certainty maps onto a sine hill: 0–50 uphill (discovery), 50–100 downhill
// (execution). Items stack in 5-point buckets; hover a dot for its title.
export function generateHillChartSVG(items, metrics) {
  const W = 920, H = 320
  const PAD = { top: 56, right: 36, bottom: 64, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const hillH = H - PAD.top - PAD.bottom
  const MAX_STACK = 8

  const hillX = s => PAD.left + (s / 100) * chartW
  const hillY = s => H - PAD.bottom - Math.sin((s / 100) * Math.PI) * hillH * 0.8

  // hill outline + fill
  const pts = []
  for (let x = 0; x <= 100; x += 2) pts.push(`${hillX(x).toFixed(1)},${hillY(x).toFixed(1)}`)
  const curve = pts.join(' ')
  const baseline = H - PAD.bottom

  // bucket items by 5-point score, stack dots upward
  const buckets = {}
  for (const item of items) {
    const bucket = Math.round((item.certainty_score ?? 0) / 5) * 5
    ;(buckets[bucket] ??= []).push(item)
  }

  const dots = []
  for (const [bucket, group] of Object.entries(buckets)) {
    const score = Number(bucket)
    const x = hillX(score).toFixed(1)
    group.slice(0, MAX_STACK).forEach((item, i) => {
      const y = (hillY(score) - 12 - i * 13).toFixed(1)
      const s = item.certainty_score ?? 0
      dots.push(
        `<circle cx="${x}" cy="${y}" r="5" fill="${levelColor(s)}" stroke="#fff" stroke-width="1.5">` +
        `<title>${esc(item.external_id)} · ${esc(item.title)} — ${s}% (${certaintyLevel(s)})</title></circle>`
      )
    })
    if (group.length > MAX_STACK) {
      const y = (hillY(score) - 12 - MAX_STACK * 13).toFixed(1)
      dots.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#6f6f6f">+${group.length - MAX_STACK}</text>`)
    }
  }

  const peakX = hillX(50).toFixed(1)
  const legend = [
    ['high', '#24a148'], ['medium', '#0f62fe'], ['low', '#f1c21b'], ['uncertain', '#da1e28'],
  ].map(([label, color], i) =>
    `<circle cx="${PAD.left + 8 + i * 92}" cy="18" r="4" fill="${color}"/>` +
    `<text x="${PAD.left + 17 + i * 92}" y="21" font-size="10" fill="#525252">${label}</text>`
  ).join('')

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hill chart" style="width:100%;height:auto;background:#f4f4f4;border:1px solid #e0e0e0">
  <style>text { font-family: 'IBM Plex Sans', system-ui, sans-serif }</style>
  ${legend}
  <polygon points="${PAD.left},${baseline} ${curve} ${PAD.left + chartW},${baseline}" fill="rgba(0,0,0,0.03)"/>
  <polyline points="${curve}" fill="none" stroke="#c6c6c6" stroke-width="2"/>
  <line x1="${peakX}" y1="${PAD.top - 8}" x2="${peakX}" y2="${baseline}" stroke="#c6c6c6" stroke-width="1" stroke-dasharray="4 4"/>
  <text x="${peakX}" y="${PAD.top - 16}" text-anchor="middle" font-size="11" fill="#6f6f6f">&#9650; Peak certainty</text>
  <text x="${hillX(25).toFixed(1)}" y="${baseline + 22}" text-anchor="middle" font-size="11" fill="#6f6f6f">Discovery — figuring it out</text>
  <text x="${hillX(75).toFixed(1)}" y="${baseline + 22}" text-anchor="middle" font-size="11" fill="#6f6f6f">Execution — getting it done</text>
  <text x="${PAD.left}" y="${H - 14}" font-size="10" fill="#525252" font-family="'IBM Plex Mono', monospace">${metrics.uphill} uphill &#183; ${metrics.downhill} downhill &#183; ${metrics.weightedAvgCertainty}% avg certainty (tier-weighted) &#183; ${metrics.velocity} delivered</text>
  ${dots.join('\n  ')}
</svg>`
}

export function generateHTML(items, projectName = 'Project', opts = {}) {
  const metrics = computeMetrics(items)
  const sorted = [...items].sort((a, b) => (b.certainty_score ?? 0) - (a.certainty_score ?? 0))
  const now = new Date().toLocaleString()
  const research = opts.research ?? {}

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certainty Units — ${projectName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: 'IBM Plex Sans', system-ui, sans-serif; background: #fff; color: #161616 }
  header { background: #161616; color: #fff; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center }
  header h1 { font-size: 20px; font-weight: 400; letter-spacing: 0.16px }
  header .meta { font-size: 12px; color: #8d8d8d }
  main { max-width: 1200px; margin: 0 auto; padding: 32px }
  .metrics { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 32px }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #161616 }
  table { width: 100%; border-collapse: collapse }
  th { text-align: left; padding: 8px 12px; font-size: 12px; color: #525252; font-weight: 600; border-bottom: 2px solid #e0e0e0; background: #f4f4f4 }
  tr:hover td { background: #f4f4f4 }
  .hill { display: flex; gap: 4px; align-items: flex-end; height: 48px; margin-bottom: 8px }
  .hill-bar { flex: 1; background: #0f62fe; border-radius: 2px 2px 0 0; opacity: 0.7 }
  footer { text-align: center; padding: 24px; font-size: 12px; color: #8d8d8d }
  footer a { color: #8d8d8d }
</style>
</head>
<body>
<header>
  <h1>Certainty Units &mdash; ${projectName}</h1>
  <span class="meta">Generated ${now}${research.pairId ? ` &middot; pair ${esc(research.pairId)}` : ''} &middot; instrument v${INSTRUMENT_VERSION}</span>
</header>
<main>
  <div class="metrics">
    ${metricBox('Total items', metrics.totalItems)}
    ${metricBox('With tier', metrics.tieredItems)}
    ${metricBox('Avg certainty', metrics.weightedAvgCertainty + '%', `tier-weighted (unweighted ${metrics.avgCertaintyScore}%)`)}
    ${metricBox('Completion rate', metrics.completionRate + '%', `${metrics.completedEstimate} / ${metrics.totalEstimate} delivered`)}
    ${metricBox('Validated share', metrics.integrityScore + '%', 'validated / completed')}
    ${metricBox('Uphill', metrics.uphill, 'discovery zone')}
    ${metricBox('Downhill', metrics.downhill, 'execution zone')}
  </div>

  ${flagNotes(metrics)}

  <h2>Hill chart</h2>
  <p style="font-size:12px;color:#525252;margin:-8px 0 12px">Left of the peak: still figuring it out. Right: executing with confidence. Hover a dot for the item.</p>
  ${generateHillChartSVG(items, metrics)}
  <p style="font-size:11px;color:#8d8d8d;margin:8px 0 32px">
    Static snapshot of the <a href="https://propozel.com" target="_blank" style="color:#8d8d8d">Certainty Units</a> hill chart.
    In <a href="https://propozel.com" target="_blank" style="color:#0f62fe;text-decoration:none">Propozel</a>, this chart is live &mdash; items move as your team validates assumptions, and stakeholders watch it update.
  </p>

  ${deltaView(items, research)}

  ${needsAttention(items)}

  <h2>Items by certainty score</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Status</th>
        <th>Validation</th>
        <th>Certainty</th>
        <th>Level</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(itemRow).join('\n')}
    </tbody>
  </table>
</main>
<footer>
  Generated by <a href="https://github.com/2ngnhan/certainty-scan" target="_blank">certainty-scan</a> &mdash; open source &mdash; scoring instrument v${INSTRUMENT_VERSION}
</footer>
</body>
</html>`
}

export function generateMarkdown(items, projectName = 'Project') {
  const m = computeMetrics(items)
  const now = new Date().toISOString().slice(0, 10)
  const sorted = [...items].sort((a, b) => (b.certainty_score ?? 0) - (a.certainty_score ?? 0))

  const rows = sorted.slice(0, 30).map(i => {
    const score = i.certainty_score ?? 0
    const level = certaintyLevel(score)
    return `| ${i.external_id} | ${i.title.slice(0, 50)} | ${i.workflow_status} | ${score} | ${level} |`
  })

  const risky = items
    .filter(i => i.workflow_status !== 'done' && (i.certainty_score ?? 0) < 50)
    .sort((a, b) => (a.certainty_score ?? 0) - (b.certainty_score ?? 0))
    .slice(0, 5)
  const attention = risky.map(i => {
    const gaps = biggestGaps(i).map(g => `${g.hint} (+${g.gap})`).join(' · ')
    return `- **${i.certainty_score ?? 0}%** [${i.external_id}](${i.url || '#'}) ${i.title.slice(0, 60)}\n  ${gaps}`
  })

  return `# Certainty Units Report — ${projectName}
_${now}_
${attention.length ? `\n## Needs attention\n\n${attention.join('\n')}\n` : ''}
## Summary

| Metric | Value |
|--------|-------|
| Total items | ${m.totalItems} |
| Avg certainty (tier-weighted) | ${m.weightedAvgCertainty}% |
| Avg certainty (unweighted) | ${m.avgCertaintyScore}% |
| Completion rate | ${m.completionRate}% |
| Validated share | ${m.integrityScore}% |
| Uphill (discovery) | ${m.uphill} |
| Downhill (execution) | ${m.downhill} |

## Items (top 30)

| ID | Title | Status | Score | Level |
|----|-------|--------|-------|-------|
${rows.join('\n')}

---
Generated by [certainty-scan](https://github.com/2ngnhan/certainty-scan)
`
}
