// Linear adapter — maps Linear issues to items via GraphQL

import {
  applyMap, mergeFieldMap,
  extractAcceptanceCriteria, validationFromLabels, tierFromLabels,
  blockedFromLabels, detectEvidenceLinks, parseDependencyRefs,
} from './util.js'

const LINEAR_API = 'https://api.linear.app/graphql'

const ISSUES_QUERY = `
  query Issues($teamId: ID!, $after: String) {
    issues(
      filter: { team: { id: { eq: $teamId } } }
      first: 100
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        description
        priority
        estimate
        state { name type }
        assignee { name }
        labels { nodes { name } }
        comments { nodes { body } }
        attachments { nodes { sourceType } }
        inverseRelations { nodes { type issue { identifier state { name type } } } }
        createdAt
        updatedAt
        url
      }
    }
  }
`

async function graphql(apiKey, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors) throw new Error(`Linear GraphQL: ${json.errors.map(e => e.message).join(', ')}`)
  return json.data
}

async function fetchAllIssues(apiKey, teamId) {
  const issues = []
  let after = null
  do {
    const data = await graphql(apiKey, ISSUES_QUERY, { teamId, after })
    issues.push(...data.issues.nodes)
    after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null
  } while (after)
  return issues
}

// Default field mapping — overridable via certainty.config.yaml fieldMap
const DEFAULT_MAP = {
  validation_status: {
    field: 'state.type',
    map: {
      completed: 'validated',
      started:   'assumed',
      triage:    'needs_clarification',
      backlog:   'unvalidated',
      cancelled: 'unvalidated',
    },
    default: 'unvalidated',
  },
  workflow_status: {
    field: 'state.type',
    map: {
      completed: 'done',
      started:   'in_progress',
      triage:    'todo',
      backlog:   'todo',
      cancelled: 'todo',
    },
    default: 'todo',
  },
  tier: {
    field: 'priority',
    map: { 1: 'advanced', 2: 'intermediate', 3: 'basic', 4: 'basic' },
    default: null,
  },
}

export async function fetchItems(config) {
  const { apiKey, teamId, fieldMap: userFieldMap } = config
  if (!apiKey) throw new Error('linear.apiKey is required')
  if (!teamId) throw new Error('linear.teamId is required')

  const issues = await fetchAllIssues(apiKey, teamId)
  const fieldMap = mergeFieldMap(DEFAULT_MAP, userFieldMap)

  // Linear state.type → workflow status (for dependency states)
  const stateToWorkflow = st => {
    if (!st) return 'unknown'
    if (/block/i.test(st.name ?? '')) return 'blocked'
    if (st.type === 'completed') return 'done'
    if (st.type === 'started') return 'in_progress'
    return 'todo'
  }

  return issues.map(issue => {
    const labels = issue.labels?.nodes?.map(l => l.name) ?? []
    const description = issue.description || ''
    const comments = issue.comments?.nodes?.map(c => c.body || '') ?? []

    // "X blocks this item" relations are this item's dependencies
    const blockers = issue.inverseRelations?.nodes
      ?.filter(r => r.type === 'blocks' && r.issue)
      ?.map(r => ({ external_id: r.issue.identifier, workflow_status: stateToWorkflow(r.issue.state) })) ?? []
    // plus dependencies declared in the description text
    const textDeps = parseDependencyRefs(description)
      .filter(ref => !blockers.some(b => b.external_id === ref))
      .map(ref => ({ external_id: ref, workflow_status: 'unknown' }))
    const dependencies = [...blockers, ...textDeps]

    // a PR/commit attachment (GitHub/GitLab sync) is first-class linked evidence
    const hasCodeAttachment = issue.attachments?.nodes
      ?.some(a => /github|gitlab|bitbucket/i.test(a.sourceType ?? '')) ?? false

    return {
      id:                 issue.id,
      external_id:        issue.identifier,
      title:              issue.title,
      description,
      url:                issue.url,
      // an explicit validation label beats inferring validation from workflow state
      validation_status:  validationFromLabels(labels) ?? applyMap(issue, fieldMap.validation_status),
      workflow_status:    applyMap(issue, fieldMap.workflow_status),
      tier:            tierFromLabels(labels) ?? applyMap(issue, fieldMap.tier),
      estimate:           issue.estimate ?? 1,
      evidence:           description,
      acceptance_criteria: extractAcceptanceCriteria(description),
      blocked:            blockedFromLabels(labels) || /block/i.test(issue.state?.name ?? ''),
      dependencies:       dependencies.length ? dependencies : null,
      linked_evidence:    hasCodeAttachment || detectEvidenceLinks(description, ...comments),
      comments_text:      comments,
      citation_count:     comments.length,
      assignee:           issue.assignee?.name ?? null,
      labels,
      created_at:         issue.createdAt,
      updated_at:         issue.updatedAt,
      source:             'linear',
    }
  })
}
