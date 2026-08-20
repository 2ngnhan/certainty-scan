// Jira adapter — maps Jira issues to items via REST API

import {
  applyMap, mergeFieldMap,
  extractAcceptanceCriteria, validationFromLabels, tierFromLabels,
  blockedFromLabels, detectEvidenceLinks, parseDependencyRefs,
} from './util.js'

function base64(str) {
  return Buffer.from(str).toString('base64')
}

async function jiraFetch(config, path) {
  const { host, email, apiToken } = config
  const url = `https://${host}/rest/api/3${path}`
  const auth = base64(`${email}:${apiToken}`)
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`)
  return res.json()
}

const SEARCH_FIELDS = 'summary,description,status,priority,assignee,labels,comment,created,updated,issuelinks,customfield_10016'

// Jira Cloud replaced /search with /search/jql (nextPageToken pagination);
// Server/Data Center still serves the old endpoint, so fall back on 404/410.
async function fetchAllIssues(config) {
  const { projectKey, jql: customJql } = config
  const jql = customJql ?? `project = "${projectKey}" ORDER BY updated DESC`
  const issues = []

  try {
    let token = null
    do {
      const params = new URLSearchParams({ jql, maxResults: '100', fields: SEARCH_FIELDS })
      if (token) params.set('nextPageToken', token)
      const data = await jiraFetch(config, `/search/jql?${params}`)
      issues.push(...(data.issues ?? []))
      token = data.nextPageToken ?? null
    } while (token)
    return issues
  } catch (e) {
    if (!/Jira API (404|410)/.test(e.message)) throw e
  }

  let startAt = 0
  do {
    const data = await jiraFetch(
      config,
      `/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=100&fields=${SEARCH_FIELDS}`
    )
    issues.push(...data.issues)
    startAt += data.issues.length
    if (startAt >= data.total) break
  } while (true)

  return issues
}

const DEFAULT_MAP = {
  validation_status: {
    field: 'fields.status.statusCategory.key',
    map: {
      done:       'validated',
      'in-progress': 'assumed',
      new:        'unvalidated',
    },
    default: 'unvalidated',
  },
  workflow_status: {
    field: 'fields.status.statusCategory.key',
    map: {
      done:          'done',
      'in-progress': 'in_progress',
      new:           'todo',
    },
    default: 'todo',
  },
  tier: {
    field: 'fields.priority.name',
    map: {
      Highest: 'advanced',
      High:    'advanced',
      Medium:  'intermediate',
      Low:     'basic',
      Lowest:  'basic',
    },
    default: null,
  },
}

export async function fetchItems(config) {
  const { host, email, apiToken, projectKey } = config
  if (!host)       throw new Error('jira.host is required (e.g. yourteam.atlassian.net)')
  if (!email)      throw new Error('jira.email is required')
  if (!apiToken)   throw new Error('jira.apiToken is required')
  if (!projectKey) throw new Error('jira.projectKey is required')

  const issues = await fetchAllIssues(config)
  const fieldMap = mergeFieldMap(DEFAULT_MAP, config.fieldMap)

  // ADF flattening: one line per block, recursive so nested lists, task
  // checklists, and smart-link cards (pasted URLs) survive into detection
  const CARD_TYPES = new Set(['inlineCard', 'blockCard', 'embedCard'])
  const adfInline = nodes => (nodes ?? []).map(n =>
    n.type === 'text' ? (n.text ?? '')
    : CARD_TYPES.has(n.type) ? (n.attrs?.url ?? '')
    : n.type === 'hardBreak' ? ' '
    : adfInline(n.content)
  ).join('')
  const CONTAINER_TYPES = new Set(['doc', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'panel', 'expand', 'tableRow', 'table', 'tableCell'])
  const adfLines = (node, out) => {
    if (!node) return out
    if (node.type === 'listItem') out.push('- ' + adfInline(node.content))
    else if (node.type === 'taskItem') out.push((node.attrs?.state === 'DONE' ? '- [x] ' : '- [ ] ') + adfInline(node.content))
    else if (CONTAINER_TYPES.has(node.type)) for (const k of node.content ?? []) adfLines(k, out)
    else {
      const text = adfInline(node.content)
      if (text.trim()) out.push(text)
    }
    return out
  }
  const adfText = adf => (adf?.content ?? []).reduce((out, b) => adfLines(b, out), []).join('\n')

  // Jira status category → workflow status (for dependency states)
  const statusToWorkflow = status => {
    if (/block/i.test(status?.name ?? '')) return 'blocked'
    const key = status?.statusCategory?.key
    if (key === 'done') return 'done'
    if (key === 'indeterminate' || key === 'in-progress') return 'in_progress'
    return 'todo'
  }

  return issues.map(issue => {
    const f = issue.fields
    // customfield_10016 is story points in most Jira configs
    const storyPoints = f.customfield_10016

    const descText = adfText(f.description)
    const labels = f.labels ?? []
    const comments = (f.comment?.comments ?? []).map(c => adfText(c.body))

    // the direction description on each side of the link says which end is
    // the dependency ("is blocked by X" / "depends on X"), not the type name
    const DEP_DIRECTION = /blocked by|depends? on|dependent on/i
    const linkDeps = (f.issuelinks ?? [])
      .map(l => {
        if (l.inwardIssue && DEP_DIRECTION.test(l.type?.inward ?? '')) return l.inwardIssue
        if (l.outwardIssue && DEP_DIRECTION.test(l.type?.outward ?? '')) return l.outwardIssue
        return null
      })
      .filter(Boolean)
      .map(dep => ({
        external_id: dep.key,
        workflow_status: statusToWorkflow(dep.fields?.status),
      }))
    const textDeps = parseDependencyRefs(descText)
      .filter(ref => !linkDeps.some(d => d.external_id === ref))
      .map(ref => ({ external_id: ref, workflow_status: 'unknown' }))
    const dependencies = [...linkDeps, ...textDeps]

    return {
      id:                  issue.id,
      external_id:         issue.key,
      title:               f.summary,
      description:         descText,
      url:                 `https://${host}/browse/${issue.key}`,
      // an explicit validation label beats inferring validation from workflow state
      validation_status:   validationFromLabels(labels) ?? applyMap(issue, fieldMap.validation_status),
      workflow_status:     applyMap(issue, fieldMap.workflow_status),
      tier:             tierFromLabels(labels) ?? applyMap(issue, fieldMap.tier),
      estimate:            storyPoints ?? 1,
      evidence:            descText,
      acceptance_criteria: extractAcceptanceCriteria(descText),
      blocked:             blockedFromLabels(labels) || /block/i.test(f.status?.name ?? ''),
      dependencies:        dependencies.length ? dependencies : null,
      linked_evidence:     detectEvidenceLinks(descText, ...comments),
      comments_text:       comments,
      citation_count:      f.comment?.total ?? 0,
      assignee:            f.assignee?.displayName ?? null,
      labels,
      created_at:          f.created,
      updated_at:          f.updated,
      source:              'jira',
    }
  })
}
