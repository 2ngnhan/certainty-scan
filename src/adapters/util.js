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
// Recognizes a heading containing "acceptance criteria" (markdown #, bold, or
// plain line ending in ":"), or falls back to markdown checklist items.
export function extractAcceptanceCriteria(text) {
  if (!text?.trim()) return null

  const lines = text.split('\n')
  const headingRe = /^\s*(?:#{1,6}\s*|\*\*)?\s*acceptance criteria\b/i

  const start = lines.findIndex(l => headingRe.test(l))
  if (start !== -1) {
    const block = []
    for (let i = start + 1; i < lines.length; i++) {
      // stop at the next heading
      if (/^\s*#{1,6}\s/.test(lines[i]) || /^\s*\*\*[^*]+\*\*\s*$/.test(lines[i])) break
      block.push(lines[i])
    }
    const body = block.join('\n').trim()
    if (body) return body
  }

  // fallback: markdown checklist anywhere in the description
  const checklist = lines.filter(l => /^\s*[-*]\s*\[[ xX]\]/.test(l))
  if (checklist.length) return checklist.join('\n')

  return null
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
