// Adapter mapping tests — mock global fetch with fixture API payloads and
// assert the item shape each adapter produces.

import test from 'node:test'
import assert from 'node:assert/strict'

function mockFetch(responder) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    const body = responder(String(url), opts)
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }
  return () => { globalThis.fetch = original }
}

test('linear: maps state, labels override validation, AC from description', async () => {
  const { fetchItems } = await import('../src/adapters/linear.js')
  const issue = {
    id: 'uuid-1', identifier: 'ENG-1', title: 'Thing',
    description: 'Intro\n## Acceptance Criteria\n- works',
    priority: 2, estimate: 3,
    state: { name: 'In Progress', type: 'started' },
    assignee: { name: 'Ada' },
    labels: { nodes: [{ name: 'validated' }, { name: 'certainty:advanced' }] },
    comments: { nodes: [{ body: 'looks fine' }, { body: 'Decision: ship it' }] },
    attachments: { nodes: [{ sourceType: 'github' }] },
    inverseRelations: { nodes: [
      { type: 'blocks', issue: { identifier: 'ENG-9', state: { name: 'Blocked', type: 'started' } } },
      { type: 'related', issue: { identifier: 'ENG-3', state: { name: 'Todo', type: 'unstarted' } } },
    ] },
    createdAt: '2026-01-01', updatedAt: '2026-01-02', url: 'https://linear.app/i/ENG-1',
  }
  const restore = mockFetch(() => ({
    data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [issue] } },
  }))
  try {
    const [item] = await fetchItems({ apiKey: 'k', teamId: 't' })
    assert.equal(item.external_id, 'ENG-1')
    assert.equal(item.workflow_status, 'in_progress')
    assert.equal(item.validation_status, 'validated', 'label should beat state-derived value')
    assert.equal(item.tier, 'advanced', 'cu: label should beat priority mapping')
    assert.equal(item.acceptance_criteria, '- works')
    assert.equal(item.citation_count, 2)
    assert.equal(item.estimate, 3)
    assert.deepEqual(item.comments_text, ['looks fine', 'Decision: ship it'])
    assert.equal(item.linked_evidence, true, 'a GitHub attachment is linked evidence')
    assert.deepEqual(item.dependencies, [{ external_id: 'ENG-9', workflow_status: 'blocked' }],
      'only "blocks" inverse relations become dependencies; blocked state names are detected')
  } finally {
    restore()
  }
})

test('jira: flattens ADF one line per block so AC headings are found', async () => {
  const { fetchItems } = await import('../src/adapters/jira.js')
  const issue = {
    id: '1', key: 'PROJ-9',
    fields: {
      summary: 'Do thing',
      description: { content: [
        { content: [{ type: 'text', text: 'Intro' }] },
        { content: [{ type: 'text', text: 'Acceptance criteria:' }] },
        { content: [{ type: 'text', text: 'done when X' }] },
      ] },
      status: { statusCategory: { key: 'in-progress' } },
      priority: { name: 'High' },
      assignee: { displayName: 'Ada' },
      labels: [],
      comment: { total: 1 },
      created: '2026-01-01', updated: '2026-01-02',
      customfield_10016: 5,
    },
  }
  const restore = mockFetch(() => ({ issues: [issue], total: 1 }))
  try {
    const [item] = await fetchItems({ host: 'x.atlassian.net', email: 'e', apiToken: 't', projectKey: 'PROJ' })
    assert.equal(item.workflow_status, 'in_progress')
    assert.equal(item.validation_status, 'assumed')
    assert.equal(item.tier, 'advanced')
    assert.equal(item.acceptance_criteria, 'done when X')
    assert.equal(item.estimate, 5)
    assert.equal(item.url, 'https://x.atlassian.net/browse/PROJ-9')
  } finally {
    restore()
  }
})

test('github: skips PRs, maps state_reason, caps at limit', async () => {
  const { fetchItems } = await import('../src/adapters/github.js')
  const issues = [
    {
      id: 1, number: 10, title: 'Open unassigned', body: '- [ ] step',
      state: 'open', state_reason: null, labels: [{ name: 'bug' }],
      assignee: null, comments: 0, html_url: 'https://github.com/o/r/issues/10',
      created_at: '2026-01-01', updated_at: '2026-01-02',
    },
    {
      id: 2, number: 11, title: 'Closed completed', body: '',
      state: 'closed', state_reason: 'completed', labels: [],
      assignee: { login: 'ada' }, comments: 4, html_url: 'https://github.com/o/r/issues/11',
      created_at: '2026-01-01', updated_at: '2026-01-02',
    },
    { id: 3, number: 12, title: 'A PR', pull_request: {}, state: 'open', labels: [] },
  ]
  const restore = mockFetch(() => issues)
  try {
    const items = await fetchItems({ repo: 'o/r' })
    assert.equal(items.length, 2, 'pull requests are skipped')
    assert.equal(items[0].external_id, '#10')
    assert.equal(items[0].workflow_status, 'todo')
    assert.equal(items[0].acceptance_criteria, '- [ ] step')
    assert.equal(items[1].workflow_status, 'done')
    assert.equal(items[1].validation_status, 'validated')
    assert.equal(items[1].citation_count, 4)
  } finally {
    restore()
  }
})

test('github: rejects a repo without owner/', async () => {
  const { fetchItems } = await import('../src/adapters/github.js')
  await assert.rejects(() => fetchItems({ repo: 'nope' }), /owner\/name/)
})

test('github: declared dependencies resolve against the fetched set; evidence links detected', async () => {
  const { fetchItems } = await import('../src/adapters/github.js')
  const issues = [
    {
      id: 1, number: 20, title: 'Feature', body: 'Depends on #21 and #22\n\nfixes #19',
      state: 'open', labels: [], assignee: null, comments: 0,
      html_url: 'https://github.com/o/r/issues/20', created_at: '2026-01-01', updated_at: '2026-01-02',
    },
    {
      id: 2, number: 21, title: 'Done dep', body: '', state: 'closed', state_reason: 'completed',
      labels: [], assignee: null, comments: 0,
      html_url: 'https://github.com/o/r/issues/21', created_at: '2026-01-01', updated_at: '2026-01-02',
    },
    {
      id: 3, number: 22, title: 'Blocked dep', body: '', state: 'open',
      labels: [{ name: 'blocked' }], assignee: null, comments: 0,
      html_url: 'https://github.com/o/r/issues/22', created_at: '2026-01-01', updated_at: '2026-01-02',
    },
  ]
  const restore = mockFetch(() => issues)
  try {
    const items = await fetchItems({ repo: 'o/r' })
    const feature = items.find(i => i.external_id === '#20')
    assert.deepEqual(feature.dependencies, [
      { external_id: '#21', workflow_status: 'done' },
      { external_id: '#22', workflow_status: 'blocked' },
    ])
    assert.equal(feature.linked_evidence, true, '"fixes #19" is a closing keyword')
    assert.equal(items.find(i => i.external_id === '#22').blocked, true)
  } finally {
    restore()
  }
})

test('jira: inward blocking links become dependencies with their status', async () => {
  const { fetchItems } = await import('../src/adapters/jira.js')
  const issue = {
    id: '1', key: 'PROJ-1',
    fields: {
      summary: 'Thing', description: null,
      status: { name: 'In Progress', statusCategory: { key: 'in-progress' } },
      priority: null, assignee: null, labels: [],
      comment: { total: 1, comments: [{ body: { content: [{ content: [{ type: 'text', text: 'Decision: use B' }] }] } }] },
      issuelinks: [
        {
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: { key: 'PROJ-7', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } },
        },
        {
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          outwardIssue: { key: 'PROJ-9', fields: { status: { name: 'To Do', statusCategory: { key: 'new' } } } },
        },
      ],
      created: '2026-01-01', updated: '2026-01-02',
    },
  }
  const restore = mockFetch(() => ({ issues: [issue], total: 1 }))
  try {
    const [item] = await fetchItems({ host: 'x.atlassian.net', email: 'e', apiToken: 't', projectKey: 'PROJ' })
    assert.deepEqual(item.dependencies, [{ external_id: 'PROJ-7', workflow_status: 'done' }],
      'only inward blocking links count; the issue this one blocks is not a dependency')
    assert.deepEqual(item.comments_text, ['Decision: use B'], 'comment ADF is flattened')
  } finally {
    restore()
  }
})

test('notion: extracts tags, acceptance column, and status mapping', async () => {
  const { fetchItems } = await import('../src/adapters/notion.js')
  const page = {
    id: 'abcd1234-ffff',
    url: 'https://notion.so/p',
    created_time: '2026-01-01', last_edited_time: '2026-01-02',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Build thing' }] },
      Status: { type: 'status', status: { name: 'In Progress' } },
      Priority: { type: 'select', select: { name: 'High' } },
      Tags: { type: 'multi_select', multi_select: [{ name: 'assumed' }] },
      Estimate: { type: 'number', number: 8 },
      Description: { type: 'rich_text', rich_text: [{ plain_text: 'context here' }] },
      'Acceptance Criteria': { type: 'rich_text', rich_text: [{ plain_text: 'done when Z' }] },
      Assignee: { type: 'people', people: [{ name: 'Ada' }] },
    },
  }
  const restore = mockFetch(() => ({ results: [page], has_more: false, next_cursor: null }))
  try {
    const [item] = await fetchItems({ apiKey: 'k', databaseId: 'd' })
    assert.equal(item.title, 'Build thing')
    assert.equal(item.workflow_status, 'in_progress')
    assert.equal(item.validation_status, 'assumed', 'tag should beat status-derived value')
    assert.equal(item.tier, 'advanced')
    assert.equal(item.acceptance_criteria, 'done when Z')
    assert.equal(item.description, 'context here')
    assert.equal(item.estimate, 8)
    assert.equal(item.assignee, 'Ada')
  } finally {
    restore()
  }
})
