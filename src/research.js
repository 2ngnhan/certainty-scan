// Research mode — pilot study support.
// Sealed Reveal: sync --research encrypts the scored results locally so the
// PM's independent rating cannot be anchored by the machine's output (H1
// protection). The key travels to the research contact, not the team; the
// report opens with `unseal --key` after the rating sheet is submitted.
// Everything here runs locally; nothing in this module makes network calls.

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { INSTRUMENT_VERSION, computeMetrics, evidenceComponents, isVerifiableAC, isAIGenerated, tierWeight } from './certainty.js'

export const SEALED_FORMAT = 'certainty-sealed'

// ── Sealing ──────────────────────────────────────────────────────────────────

export function generateKey() {
  return randomBytes(32).toString('hex')
}

// The plaintext envelope metadata is bound into the GCM auth tag as AAD, so
// editing pair_id or mode on a sealed file is detected at unseal.
function envelopeAAD(env) {
  return Buffer.from(`${env.format}|${env.pair_id ?? ''}|${env.mode ?? ''}|${env.instrument_version ?? ''}`, 'utf8')
}

export function seal(payload, keyHex, meta = {}) {
  const iv = randomBytes(12)
  const env = {
    format: SEALED_FORMAT,
    instrument_version: INSTRUMENT_VERSION,
    pair_id: meta.pairId ?? null,
    mode: meta.mode ?? 'active',
    sealed_at: new Date().toISOString(),
    alg: 'aes-256-gcm',
  }
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  cipher.setAAD(envelopeAAD(env))
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return JSON.stringify({
    ...env,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }, null, 2)
}

export function unseal(envelopeJson, keyHex) {
  let env
  try {
    env = JSON.parse(envelopeJson)
  } catch {
    throw new Error('not a certainty-sealed file (invalid JSON)')
  }
  if (env?.format !== SEALED_FORMAT) throw new Error('not a certainty-sealed file')
  let text
  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(env.iv, 'base64'))
    decipher.setAAD(envelopeAAD(env))
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'))
    text = Buffer.concat([
      decipher.update(Buffer.from(env.data, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('wrong key (or the sealed file was tampered with)')
  }
  return { payload: JSON.parse(text), envelope: env }
}

// ── Anonymization ────────────────────────────────────────────────────────────

// Salted with the pair id: hashes stay stable within a pair (so audit 1 and
// audit 2 items link up) but cannot be dictionary-confirmed without it.
export function hashTitle(title, salt = '') {
  return createHash('sha256').update(`${salt}\n${String(title ?? '')}`).digest('hex').slice(0, 16)
}

// The research export carries scores and signals by item id with hashed
// titles. No titles, descriptions, assignees, or URLs ever leave the machine.
export function buildResearchExport(items, meta = {}) {
  const signalPoints = (item, name) =>
    item.certainty_breakdown?.find(s => s.signal === name)?.points ?? null

  return {
    format: 'certainty-research-export',
    instrument_version: INSTRUMENT_VERSION,
    tool_version: meta.toolVersion ?? null,
    pair_id: meta.pairId ?? null,
    mode: meta.mode ?? 'active',
    consent: meta.consent ?? false,
    revealed_first: meta.revealedFirst ?? false,
    has_rating: items.some(i => i.pm_rating != null),
    spearman: meta.spearman ?? null,
    generated_at: new Date().toISOString(),
    metrics: computeMetrics(items),
    items: items.map(i => {
      const ev = evidenceComponents(i)
      return {
        item_id: i.external_id,
        title_hash: hashTitle(i.title, meta.pairId ?? ''),
        source: i.source,
        certainty_score: i.certainty_score ?? null,
        signals: {
          validation: signalPoints(i, 'validation'),
          workflow: signalPoints(i, 'workflow'),
          acceptance: signalPoints(i, 'acceptance criteria'),
          evidence: signalPoints(i, 'evidence'),
          discussion: signalPoints(i, 'discussion'),
        },
        flags: i.flags ?? [],
        validation_status: i.validation_status ?? null,
        workflow_status: i.workflow_status ?? null,
        tier: i.tier ?? null,
        // tracker_tier is set (possibly to null) when the PM tier took over;
        // ?? would misreport a tier-less tracker as having the PM's tier
        tracker_tier: 'tracker_tier' in i ? i.tracker_tier : (i.tier ?? null),
        tier_weight: tierWeight(i.tier),
        estimate: i.estimate ?? null,
        blocked: Boolean(i.blocked),
        dependencies_declared: i.dependencies?.length ?? 0,
        linked_evidence: Boolean(i.linked_evidence),
        citation_count: i.citation_count ?? 0,
        // H3 readability fields: documentation completeness per item
        description_length: (i.description ?? '').length,
        ac_present: Boolean(i.acceptance_criteria?.trim()),
        ac_verifiable: isVerifiableAC(i.acceptance_criteria),
        ai_generated: isAIGenerated(i),
        pm_rating: i.pm_rating ?? null,
        pm_tier: i.pm_tier ?? null,
        created_at: i.created_at ?? null,
        updated_at: i.updated_at ?? null,
      }
    }),
  }
}

// ── PM rating merge + Spearman (H1) ──────────────────────────────────────────

// Spearman rank correlation with average ranks for ties.
export function spearman(pairs) {
  const n = pairs.length
  if (n < 3) return null
  const rank = values => {
    const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const ranks = new Array(n)
    let k = 0
    while (k < n) {
      let j = k
      while (j + 1 < n && sorted[j + 1].v === sorted[k].v) j++
      const avg = (k + j + 2) / 2 // ranks are 1-based
      for (let m = k; m <= j; m++) ranks[sorted[m].i] = avg
      k = j + 1
    }
    return ranks
  }
  const rx = rank(pairs.map(p => p[0]))
  const ry = rank(pairs.map(p => p[1]))
  const mean = arr => arr.reduce((a, b) => a + b, 0) / n
  const mx = mean(rx), my = mean(ry)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return Math.round((num / Math.sqrt(dx * dy)) * 1000) / 1000
}

// Merge the PM's rating sheet into the scored items. The PM-assigned tier is
// the instrument's tier (Chapter 3), so it takes over for aggregation; the
// tracker-derived tier is kept for reference.
export function applyRatings(items, rating) {
  const byId = new Map((rating.items ?? []).map(r => [r.id, r]))
  let matched = 0
  for (const item of items) {
    const r = byId.get(item.external_id)
    if (!r) continue
    matched++
    if (r.certainty != null) item.pm_rating = Number(r.certainty)
    if (r.tier) {
      item.tracker_tier = item.tier ?? null
      item.pm_tier = r.tier
      item.tier = r.tier
    }
    if (r.adverse) item.pm_tier_adverse = r.adverse
  }
  const pairs = items
    .filter(i => i.pm_rating != null && i.certainty_score != null)
    .map(i => [i.certainty_score, i.pm_rating])
  return { matched, rated: pairs.length, spearman: { rho: spearman(pairs), n: pairs.length } }
}

// ── Rating sheet (local HTML form, no scores, no network) ────────────────────

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function generateRatingSheetHTML(items, meta = {}) {
  const rows = items.map((i, idx) => `
    <tr data-id="${esc(i.external_id)}">
      <td class="id">${esc(i.external_id)}</td>
      <td class="title">${esc(i.title)}</td>
      <td class="q"><input type="checkbox" id="q1-${idx}" aria-label="Team đã làm loại việc này chưa tới 2 lần trước đây"></td>
      <td class="q"><input type="checkbox" id="q2-${idx}" aria-label="Lỗi phát hiện muộn sẽ lan rộng hoặc tốn hơn 1 tuần"></td>
      <td class="q"><input type="checkbox" id="q3-${idx}" aria-label="Còn phải khám phá yêu cầu hoặc giải pháp"></td>
      <td class="tier" id="tier-${idx}">Mặc định (Intermediate)</td>
      <td class="rate">
        <select id="c-${idx}" aria-label="Certainty 1 đến 9">
          <option value="">--</option>
          ${[1,2,3,4,5,6,7,8,9].map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('\n')

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phiếu rating certainty (PM) ${meta.pairId ? '· ' + esc(meta.pairId) : ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: 'IBM Plex Sans', system-ui, sans-serif; background: #fff; color: #161616; padding: 32px; max-width: 1100px; margin: 0 auto }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px }
  .meta { font-size: 12px; color: #525252; margin-bottom: 16px }
  .box { background: #f4f4f4; border-left: 4px solid #0f62fe; padding: 14px 18px; font-size: 13px; line-height: 1.6; margin-bottom: 20px }
  .box b { font-weight: 600 }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px }
  th { text-align: left; padding: 8px; font-size: 11px; color: #525252; border-bottom: 2px solid #e0e0e0; background: #f4f4f4; vertical-align: bottom }
  td { padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 13px }
  td.id { font-family: ui-monospace, monospace; font-size: 12px; color: #0f62fe; white-space: nowrap }
  td.q, th.q { text-align: center; width: 72px }
  td.tier { font-size: 11px; color: #525252; width: 100px }
  select { padding: 4px 6px; font-size: 13px }
  textarea, input[type=text] { width: 100%; padding: 8px; font-size: 13px; border: 1px solid #8d8d8d; margin-top: 4px }
  label { font-size: 13px; font-weight: 600; display: block; margin-top: 14px }
  button { background: #0f62fe; color: #fff; border: none; padding: 12px 24px; font-size: 14px; cursor: pointer; margin-top: 20px }
  button:hover { background: #0043ce }
  .warn { color: #da1e28; font-size: 13px; margin-top: 8px; display: none }
  .done { color: #24a148; font-size: 13px; margin-top: 8px; display: none }
</style>
</head>
<body>
<h1>Phiếu rating certainty của PM</h1>
<div class="meta">Pair: ${esc(meta.pairId ?? 'chưa cấp')} · Instrument v${INSTRUMENT_VERSION} · Sinh lúc ${new Date().toISOString()}</div>
<div class="box">
  <b>Cách điền, mất khoảng 10 đến 15 phút.</b> Phiếu này chạy hoàn toàn trên máy bạn và không gọi mạng.
  Với mỗi hạng mục, bạn tick vào ô nếu câu trả lời là CÓ:
  <b>Q1</b>: team đã làm loại việc này chưa tới 2 lần trước đây (0 hoặc 1 lần).
  <b>Q2</b>: nếu lỗi phát hiện muộn, nó sẽ lan sang cấu phần khác hoặc tốn hơn 1 tuần để sửa.
  <b>Q3</b>: yêu cầu hoặc giải pháp còn phải khám phá thêm.
  Tier được tính tự động từ 3 câu đó; hạng mục bạn không trả lời 3 câu sẽ dùng mặc định Intermediate.
  Sau đó chấm <b>certainty 1 đến 9</b> theo cảm nhận hiện tại của bạn
  (1: gần như chưa biết gì chắc chắn, 9: chắc chắn, chỉ còn thực thi). Hạng mục ngoài phạm vi bạn nắm thì để trống.
  <b>Không mở file certainty-report.sealed trước khi nộp phiếu này.</b>
</div>
<table>
  <thead>
    <tr>
      <th>ID</th><th>Hạng mục</th>
      <th class="q">Q1 làm dưới 2 lần</th>
      <th class="q">Q2 lỗi muộn lan rộng</th>
      <th class="q">Q3 còn khám phá</th>
      <th>Tier</th>
      <th>Certainty 1-9</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<label for="areas">Ba vùng bạn thấy kém chắc chắn nhất của dự án lúc này (mỗi dòng một vùng)</label>
<textarea id="areas" rows="3" placeholder="1. ...&#10;2. ...&#10;3. ..."></textarea>
<label for="role">Vai trò của bạn</label>
<input type="text" id="role" placeholder="PM / PO / Tech lead / ...">
<button id="export">Export rating.json</button>
<div class="warn" id="warn"></div>
<div class="done" id="done">Đã tải rating.json. Gửi file này cho đầu mối nghiên cứu để nhận key mở khóa báo cáo.</div>
<script>
(function () {
  var N = ${items.length}
  // rows the PM never answered Q1-Q3 on export tier null: "no answers" must
  // not be read as "three no answers", the analysis defaults them to intermediate
  var touched = {}
  function tierOf(adv) { return adv === 0 ? 'basic' : adv === 1 ? 'intermediate' : 'advanced' }
  function tierLabel(t) { return t.charAt(0).toUpperCase() + t.slice(1) }
  function recompute(idx) {
    var adv = 0
    ;['q1', 'q2', 'q3'].forEach(function (q) {
      if (document.getElementById(q + '-' + idx).checked) adv++
    })
    document.getElementById('tier-' + idx).textContent = tierLabel(tierOf(adv))
  }
  for (var i = 0; i < N; i++) (function (idx) {
    ;['q1', 'q2', 'q3'].forEach(function (q) {
      document.getElementById(q + '-' + idx).addEventListener('change', function () {
        touched[idx] = true
        recompute(idx)
      })
    })
  })(i)
  document.getElementById('export').addEventListener('click', function () {
    var rows = document.querySelectorAll('tbody tr')
    var out = []
    rows.forEach(function (tr, idx) {
      var c = document.getElementById('c-' + idx).value
      if (!c) return
      var adverse = ['q1', 'q2', 'q3'].map(function (q) {
        return document.getElementById(q + '-' + idx).checked
      })
      var adv = adverse.filter(Boolean).length
      out.push({
        id: tr.getAttribute('data-id'),
        certainty: Number(c),
        tier: touched[idx] ? tierOf(adv) : null,
        adverse: touched[idx] ? adverse : null,
      })
    })
    var warn = document.getElementById('warn')
    if (!out.length) {
      warn.textContent = 'Chưa có hạng mục nào được chấm certainty.'
      warn.style.display = 'block'
      return
    }
    warn.style.display = 'none'
    var areas = document.getElementById('areas').value.split('\\n')
      .map(function (s) { return s.trim() }).filter(Boolean).slice(0, 3)
    var payload = {
      format: 'certainty-rating',
      instrument_version: '${INSTRUMENT_VERSION}',
      pair_id: ${JSON.stringify(meta.pairId ?? null)},
      exported_at: new Date().toISOString(),
      rater_role: document.getElementById('role').value.trim() || null,
      least_certain_areas: areas,
      items: out,
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'rating.json'
    a.click()
    URL.revokeObjectURL(a.href)
    document.getElementById('done').style.display = 'block'
  })
})()
</script>
</body>
</html>`
}
