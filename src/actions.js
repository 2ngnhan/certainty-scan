// From score to action: turn an item's biggest certainty gaps into concrete,
// work-level next steps a team member can pick up, and optionally file them
// back into the tracker as follow-up issues.

import { biggestGaps } from './certainty.js'

export const FOLLOW_UP_PREFIX = 'Raise certainty: '

// Anti-circularity rule 2: everything the tool writes into the tracker is
// labelled and never scored, so the tool cannot inflate its own score on the
// next sync.
export const GENERATED_LABEL = 'certainty-generated'

export function isToolGenerated(item) {
  return Boolean(item.title?.startsWith(FOLLOW_UP_PREFIX)) ||
    (item.labels ?? []).some(l => String(l).toLowerCase().trim() === GENERATED_LABEL)
}

// kept as an alias for the follow-up bookkeeping below
export const isFollowUp = isToolGenerated

// Work-level phrasing, not score-level: each action names what to actually do.
const ACTION_FOR = {
  validation:
    'Validate with linked evidence: merge the PR / attach the test run or sign-off, link it on the item, then label it "validated"',
  discussion:
    'Record the conclusion: post a "Decision: …" comment or section once the debate lands, not just back-and-forth',
  'acceptance criteria':
    'Write verifiable acceptance criteria: an "## Acceptance Criteria" section with 2-3 testable bullets',
  evidence:
    'Structure the description: what the goal is, how it will be done, and what it depends on',
  workflow:
    'Declare dependencies on the item (or unblock the ones that are blocked)',
}

function hasFollowUp(items, target) {
  return items.some(i => isToolGenerated(i) && i.title.includes(target.title))
}

// The least certain open items, each with a short list of concrete actions.
// `allItems` may include tool-generated items (excluded from scoring) so that
// already-filed follow-ups are still detected.
export function buildNextActions(items, limit = 5, allItems = items) {
  return items
    .filter(i => i.workflow_status !== 'done' && !isToolGenerated(i))
    .sort((a, b) => (a.certainty_score ?? 0) - (b.certainty_score ?? 0))
    .slice(0, limit)
    .map(item => {
      const actions = biggestGaps(item, 6)
        .filter(g => ACTION_FOR[g.signal])
        .map(g => ({ signal: g.signal, text: ACTION_FOR[g.signal], gain: g.gap }))
      return { item, actions, alreadyFiled: hasFollowUp(allItems, item) }
    })
    .filter(plan => plan.actions.length > 0)
}

// Regroup plans by action so each chore prints once with the items it applies
// to — low-certainty items mostly share the same gaps, and a per-item listing
// repeats the same sentences five times.
export function groupNextActions(plans) {
  const groups = new Map()
  for (const { item, actions } of plans) {
    for (const a of actions) {
      const g = groups.get(a.signal) ?? { signal: a.signal, text: a.text, ids: [], gains: [] }
      g.ids.push(item.external_id)
      g.gains.push(a.gain)
      groups.set(a.signal, g)
    }
  }
  return [...groups.values()]
    .map(g => ({ ...g, maxGain: Math.max(...g.gains), uniform: g.gains.every(x => x === g.gains[0]) }))
    .sort((a, b) => b.maxGain - a.maxGain)
}

// File one follow-up issue per plan (GitHub only). Skips items that already
// have an open follow-up so re-runs don't spam the tracker. Every filed issue
// carries GENERATED_LABEL so later syncs exclude it from scoring.
export async function createGitHubIssues(githubConfig, plans) {
  const { repo, token } = githubConfig ?? {}
  if (!repo) throw new Error('--create-issues requires source: github (set github.repo in your config)')
  if (!token) throw new Error('--create-issues requires github.token with write access to the repo')

  const created = []
  for (const { item, actions, alreadyFiled } of plans) {
    if (alreadyFiled) continue
    const title = `${FOLLOW_UP_PREFIX}${item.title} (${item.certainty_score ?? 0}%)`
    const body = [
      `Certainty follow-up for ${item.url ?? item.external_id} (score: ${item.certainty_score ?? 0}%).`,
      '',
      ...actions.map(a => `- [ ] ${a.text} (+${a.gain})`),
      '',
      '_Filed by [certainty-scan](https://github.com/2ngnhan/certainty-scan). Labelled `certainty-generated`: excluded from scoring._',
    ].join('\n')

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body, labels: [GENERATED_LABEL] }),
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    const issue = await res.json()
    created.push({ url: issue.html_url, for: item.external_id })
  }
  return created
}
