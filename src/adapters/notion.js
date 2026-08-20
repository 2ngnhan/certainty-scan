// Notion adapter — maps a Notion database to items via Notion API

import {
  mergeFieldMap, validationFromLabels, tierFromLabels,
  blockedFromLabels, detectEvidenceLinks, parseDependencyRefs,
} from './util.js'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

async function notionFetch(apiKey, path, body = null) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function fetchAllPages(apiKey, databaseId) {
  const pages = []
  let cursor = null

  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const data = await notionFetch(apiKey, `/databases/${databaseId}/query`, body)
    pages.push(...data.results)
    cursor = data.has_more ? data.next_cursor : null
  } while (cursor)

  return pages
}

// Extract plain text from a Notion rich_text array
function richText(arr) {
  return arr?.map(r => r.plain_text).join('') ?? ''
}

// Extract value from a Notion property by type
function extractProp(prop) {
  if (!prop) return null
  switch (prop.type) {
    case 'title':        return richText(prop.title)
    case 'rich_text':   return richText(prop.rich_text)
    case 'select':      return prop.select?.name ?? null
    case 'status':      return prop.status?.name ?? null
    case 'multi_select': return prop.multi_select?.map(s => s.name) ?? []
    case 'number':      return prop.number
    case 'checkbox':    return prop.checkbox
    case 'date':        return prop.date?.start ?? null
    case 'people':      return prop.people?.map(p => p.name).join(', ') ?? null
    case 'url':         return prop.url
    default:            return null
  }
}

// Default field map — teams override column names via config
const DEFAULT_MAP = {
  validation_status: {
    field: 'Status',  // Notion column name
    map: {
      Done:        'validated',
      'In Progress': 'assumed',
      'To Do':     'unvalidated',
      Backlog:     'unvalidated',
    },
    default: 'unvalidated',
  },
  workflow_status: {
    field: 'Status',
    map: {
      Done:          'done',
      'In Progress': 'in_progress',
      'To Do':       'todo',
      Backlog:       'todo',
    },
    default: 'todo',
  },
  tier: {
    field: 'Priority',
    map: {
      High:   'advanced',
      Medium: 'intermediate',
      Low:    'basic',
    },
    default: null,
  },
  title_field:       { field: 'Name' },
  assignee_field:    { field: 'Assignee' },
  estimate_field:    { field: 'Estimate' },
  labels_field:      { field: 'Tags' },                 // multi_select
  description_field: { field: 'Description' },          // rich_text
  acceptance_field:  { field: 'Acceptance Criteria' },  // rich_text
}

export async function fetchItems(config) {
  const { apiKey, databaseId } = config
  if (!apiKey)     throw new Error('notion.apiKey is required')
  if (!databaseId) throw new Error('notion.databaseId is required')

  const pages = await fetchAllPages(apiKey, databaseId)
  const fm = mergeFieldMap(DEFAULT_MAP, config.fieldMap)

  return pages.map(page => {
    const props = page.properties
    const statusRaw = extractProp(props[fm.validation_status.field])
    const labelsRaw = extractProp(props[fm.labels_field?.field])
    const labels = Array.isArray(labelsRaw) ? labelsRaw : []
    const description = extractProp(props[fm.description_field?.field]) ?? ''
    const acceptance = extractProp(props[fm.acceptance_field?.field])

    return {
      id:                  page.id,
      external_id:         page.id.slice(0, 8),
      title:               extractProp(props[fm.title_field.field]) ?? 'Untitled',
      description,
      url:                 page.url,
      // an explicit validation tag beats inferring validation from workflow state
      validation_status:   validationFromLabels(labels)
                             ?? fm.validation_status.map[statusRaw] ?? fm.validation_status.default,
      workflow_status:     fm.workflow_status.map[statusRaw] ?? fm.workflow_status.default,
      tier:             tierFromLabels(labels) ?? (() => {
        const raw = extractProp(props[fm.tier.field])
        return fm.tier.map[raw] ?? fm.tier.default
      })(),
      estimate:            extractProp(props[fm.estimate_field?.field]) ?? 1,
      evidence:            description,
      acceptance_criteria: typeof acceptance === 'string' && acceptance.trim() ? acceptance : null,
      blocked:             blockedFromLabels(labels) || /block/i.test(String(statusRaw ?? '')),
      dependencies:        (() => {
        const refs = parseDependencyRefs(description)
        return refs.length ? refs.map(ref => ({ external_id: ref, workflow_status: 'unknown' })) : null
      })(),
      linked_evidence:     detectEvidenceLinks(description),
      comments_text:       [],
      citation_count:      0,
      assignee:            extractProp(props[fm.assignee_field?.field]),
      labels,
      created_at:          page.created_time,
      updated_at:          page.last_edited_time,
      source:              'notion',
    }
  })
}
