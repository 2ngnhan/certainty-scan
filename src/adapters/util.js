// Shared adapter helpers: field mapping + signal extraction from real work items.

export function getField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

export function applyMap(issue, fieldDef) {
  const raw = getField(issue, fieldDef.field)
  return fieldDef.map[raw] ?? fieldDef.default
}

export function mergeFieldMap(defaults, userMap = {}) {
  const merged = structuredClone(defaults)
  for (const [field, def] of Object.entries(userMap)) {
    if (typeof def === 'object' && def !== null && def.map) {
      merged[field] = {
        field:   def.field ?? merged[field]?.field,
        map:     { ...merged[field]?.map, ...def.map },
        default: def.default ?? merged[field]?.default ?? null,
      }
    } else {
      merged[field] = def
    }
  }
  return merged
}

// Pull an acceptance-criteria block out of a free-text description.
// Recognizes an explicit heading only: "Acceptance criteria", "Definition of
// done", or "Tiêu chí nghiệm thu" (markdown #, bold, or a line ending in ":").
//
// v0.4: there is no checklist fallback. Issue templates ship pre-checked
// attestation boxes ("Follow our Code of Conduct", "Read the docs"); reading
// those as acceptance criteria scored 21 of 30 bug reports in a public-repo
// illustration at 15/15. A criterion only counts when someone wrote it as one.
const AC_HEADING_RE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(?:acceptance\s+criteria|definition\s+of\s+done|ti[êe]u\s*ch[íi]\s*nghi[ệe]m\s*thu)\b/i

export function extractAcceptanceCriteria(text) {
  if (!text?.trim()) return null

  const lines = text.split('\n')
  const start = lines.findIndex(l => AC_HEADING_RE.test(l))
  if (start === -1) return null

  // criteria written on the heading line itself ("Acceptance criteria: …")
  const inline = lines[start].replace(AC_HEADING_RE, '').replace(/^[\s*:]+/, '').trim()
  const block = inline ? [inline] : []
  for (let i = start + 1; i < lines.length; i++) {
    // stop at the next heading
    if (/^\s*#{1,6}\s/.test(lines[i]) || /^\s*\*\*[^*]+\*\*\s*$/.test(lines[i])) break
    block.push(lines[i])
  }
  const body = block.join('\n').trim()
  return body || null
}

// Labels are the cheapest place for a team to record validation explicitly.
// A label like "validated" beats inferring validation from workflow state.
const VALIDATION_LABELS = {
  'validated':            'validated',
  'validation:validated': 'validated',
  'assumed':              'assumed',
  'assumption':           'assumed',
  'validation:assumed':   'assumed',
  'needs-clarification':  'needs_clarification',
  'needs clarification':  'needs_clarification',
  'unvalidated':          'unvalidated',
}

export function validationFromLabels(labels = []) {
  for (const label of labels) {
    const hit = VALIDATION_LABELS[String(label).toLowerCase().trim()]
    if (hit) return hit
  }
  return null
}

// certainty:basic / certainty:intermediate / certainty:advanced labels set the tier explicitly.
const TIER_LABELS = {
  'certainty:basic':        'basic',
  'certainty:intermediate': 'intermediate',
  'certainty:advanced':     'advanced',
}

export function tierFromLabels(labels = []) {
  for (const label of labels) {
    const hit = TIER_LABELS[String(label).toLowerCase().trim()]
    if (hit) return hit
  }
  return null
}

// A "blocked" label marks the item blocked regardless of workflow state.
const BLOCKED_LABELS = new Set(['blocked', 'status:blocked', 'status: blocked', 'blocked:yes'])

export function blockedFromLabels(labels = []) {
  return labels.some(l => BLOCKED_LABELS.has(String(l).toLowerCase().trim()))
}

// Linked evidence for the v0.2 Validation signal: a merged PR / commit / MR
// URL, or closing keywords that tie the item to a change. Text-based; adapters
// with first-class links (Linear attachments, Jira dev panel) add their own.
const EVIDENCE_LINK_RE = new RegExp(
  [
    'github\\.com/[^\\s)]+/(?:pull|commit)/\\w+',
    'gitlab\\.com/[^\\s)]+/-/(?:merge_requests|commit)/\\w+',
    'bitbucket\\.org/[^\\s)]+/(?:pull-requests|commits)/\\w+',
    '\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#\\d+',
  ].join('|'),
  'i'
)

export function detectEvidenceLinks(...texts) {
  return texts.some(t => t && EVIDENCE_LINK_RE.test(t))
}

// v0.4, GitHub only: a PR or commit URL counts as evidence only when it points
// into the item's own repository. A link to another project's PR is not
// evidence about this item. Closing keywords ("fixes #12") are repo-local by
// construction and still count. Other hosts' URLs never count here.
export function detectEvidenceLinksInRepo(repo, ...texts) {
  const r = String(repo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const scoped = new RegExp(
    [`github\\.com/${r}/(?:pull|commit)/\\w+`, '\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#\\d+'].join('|'),
    'i'
  )
  return texts.some(t => t && scoped.test(t))
}

// v0.4: an explicit statement that an item has no dependencies is a recorded
// claim, distinct from never having declared any. Label `no-dependencies`, or a
// line such as "Dependencies: none" / "Phụ thuộc: không".
const NO_DEPS_LABELS = new Set(['no-dependencies', 'no dependencies', 'independent'])
const NO_DEPS_RE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(?:dependenc(?:y|ies)|depends\s+on|ph[ụu]\s*thu[ộô]c)\s*\**\s*:\s*\**\s*(?:none|n\/a|kh[ôo]ng(?:\s*c[óo])?)\s*\.?\s*$/im

export function declaresNoDependencies(text, labels = []) {
  if (labels.some(l => NO_DEPS_LABELS.has(String(l).toLowerCase().trim()))) return true
  return NO_DEPS_RE.test(text ?? '')
}

// v0.4: an item opened by an automation account is machine-authored for the
// purposes of anti-circularity rule 1, whether or not it carries an AI marker.
export function isBotLogin(login, type) {
  return type === 'Bot' || /\[bot\]$/i.test(String(login ?? ''))
}

// Declared dependencies parsed from free text: "depends on #12", "blocked by
// ENG-42", "phụ thuộc vào #7". Returns external ids (tracker keys uppercased);
// the adapter resolves their states where it can. Separators exclude newlines
// so a declaration never swallows refs from the following sentence.
const DEP_DECL_RE = /(?:depends[- ]+on|blocked[- ]+by|waiting[- ]+on|ph[ụu]\s*thu[ộô]c(?:\s*v[àa]o)?)[ \t]*:?[ \t]+((?:(?:#\d+|[A-Za-z][A-Za-z0-9]*-\d+)[ \t,;]*(?:and[ \t]+|v[àa][ \t]+)?)+)/gi
const DEP_REF_RE = /#\d+|[A-Za-z][A-Za-z0-9]*-\d+/g

export function parseDependencyRefs(text) {
  if (!text) return []
  const refs = new Set()
  for (const m of text.matchAll(DEP_DECL_RE)) {
    for (const ref of m[1].match(DEP_REF_RE) ?? []) {
      refs.add(ref.startsWith('#') ? ref : ref.toUpperCase())
    }
  }
  return [...refs]
}
