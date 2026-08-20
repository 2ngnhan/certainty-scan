// GitHub Issues adapter — maps repo issues to items via REST API.
// Works without a token on public repos (rate-limited); set github.token for
// private repos or higher limits.

import {
  applyMap, mergeFieldMap,
  extractAcceptanceCriteria, validationFromLabels, tierFromLabels,
  blockedFromLabels, detectEvidenceLinks, parseDependencyRefs,
} from './util.js'

const GITHUB_API = 'https://api.github.com'

async function githubFetch(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  // cursor-based pagination: GitHub puts the next-page URL in the Link header
  const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null
  return { data: await res.json(), next }
}

// Most recently updated first, capped so a huge backlog doesn't hang the sync.
async function fetchAllIssues(repo, token, { state = 'all', limit = 500 } = {}) {
  const issues = []
  let url = `${GITHUB_API}/repos/${repo}/issues?state=${state}&sort=updated&direction=desc&per_page=100`
  while (url && issues.length < limit) {
    const { data, next } = await githubFetch(url, token)
    // the issues endpoint also returns pull requests — skip them
    issues.push(...data.filter(i => !i.pull_request))
    url = next
  }
  return issues.slice(0, limit)
}

const DEFAULT_MAP = {
  validation_status: {
    field: 'state_reason',
    map: {
      completed:   'validated',
      not_planned: 'unvalidated',
      reopened:    'assumed',
    },
    default: 'unvalidated',
  },
}

function workflowStatus(issue) {
  if (issue.state === 'closed') return 'done'
  return issue.assignee ? 'in_progress' : 'todo'
}

// Comment bodies power the decision-based Discussion signal. One extra request
// per commented issue, so it is opt-in (config.deep — research mode sets it).
const DEEP_COMMENT_FETCH_CAP = 200

async function fetchCommentBodies(repo, token, issues) {
  const withComments = issues.filter(i => (i.comments ?? 0) > 0).slice(0, DEEP_COMMENT_FETCH_CAP)
  const bodies = new Map()
  for (const issue of withComments) {
    try {
      const { data } = await githubFetch(
        `${GITHUB_API}/repos/${repo}/issues/${issue.number}/comments?per_page=100`, token)
      bodies.set(issue.number, data.map(c => c.body || ''))
    } catch {
      // comments are an enhancement; never fail the sync over them
    }
  }
  if (issues.filter(i => (i.comments ?? 0) > 0).length > DEEP_COMMENT_FETCH_CAP) {
    console.error(`  note: comment bodies fetched for the first ${DEEP_COMMENT_FETCH_CAP} commented issues only`)
  }
  return bodies
}

export async function fetchItems(config) {
  const { repo, token, state, limit, deep } = config
  if (!repo || !repo.includes('/')) {
    throw new Error('github.repo is required (e.g. owner/name)')
  }

  const effectiveLimit = limit ?? 500
  const issues = await fetchAllIssues(repo, token, { state, limit: effectiveLimit })
  if (issues.length >= effectiveLimit) {
    console.error(`  note: capped at ${issues.length} most recently updated issues (set github.limit to raise)`)
  }
  const fieldMap = mergeFieldMap(DEFAULT_MAP, config.fieldMap)
  const commentBodies = deep ? await fetchCommentBodies(repo, token, issues) : new Map()

  // resolve text-declared dependencies ("depends on #12") within the fetched
  // set; refs outside the recently-updated window get fetched individually so
  // an old, closed dependency is not misread as still open
  const byNumber = new Map(issues.map(i => [`#${i.number}`, i]))
  const declaredRefs = new Set(issues.flatMap(i => parseDependencyRefs(i.body || '')))
  const unresolved = [...declaredRefs].filter(r => r.startsWith('#') && !byNumber.has(r)).slice(0, 25)
  for (const ref of unresolved) {
    try {
      const { data } = await githubFetch(`${GITHUB_API}/repos/${repo}/issues/${ref.slice(1)}`, token)
      if (!data.pull_request) byNumber.set(ref, data)
    } catch {
      // cross-repo or deleted refs stay unknown
    }
  }
  const depStatus = ref => {
    const dep = byNumber.get(ref)
    if (!dep) return 'unknown'
    const depLabels = dep.labels?.map(l => (typeof l === 'string' ? l : l.name)) ?? []
    if (blockedFromLabels(depLabels)) return 'blocked'
    return workflowStatus(dep)
  }

  return issues.map(issue => {
    const labels = issue.labels?.map(l => (typeof l === 'string' ? l : l.name)) ?? []
    const body = issue.body || ''
    const comments = commentBodies.get(issue.number) ?? []
    const depRefs = parseDependencyRefs(body)

    return {
      id:                  String(issue.id),
      external_id:         `#${issue.number}`,
      title:               issue.title,
      description:         body,
      url:                 issue.html_url,
      // an explicit validation label beats inferring validation from issue state
      validation_status:   validationFromLabels(labels) ?? applyMap(issue, fieldMap.validation_status),
      workflow_status:     workflowStatus(issue),
      tier:             tierFromLabels(labels),
      estimate:            1,
      evidence:            body,
      acceptance_criteria: extractAcceptanceCriteria(body),
      blocked:             blockedFromLabels(labels),
      dependencies:        depRefs.length
                             ? depRefs.map(ref => ({ external_id: ref, workflow_status: depStatus(ref) }))
                             : null,
      linked_evidence:     detectEvidenceLinks(body, ...comments),
      comments_text:       comments,
      citation_count:      issue.comments ?? 0,
      assignee:            issue.assignee?.login ?? null,
      labels,
      created_at:          issue.created_at,
      updated_at:          issue.updated_at,
      source:              'github',
    }
  })
}
