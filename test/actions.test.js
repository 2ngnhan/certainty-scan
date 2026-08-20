import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNextActions, groupNextActions, createGitHubIssues,
  isFollowUp, isToolGenerated, FOLLOW_UP_PREFIX, GENERATED_LABEL,
} from '../src/actions.js'

function item(id, score, over = {}) {
  return {
    external_id: id, title: `Item ${id}`, url: `https://x/${id}`,
    certainty_score: score, workflow_status: 'todo',
    validation_status: 'unvalidated', citation_count: 0, ...over,
  }
}

test('buildNextActions picks least certain open items with work-level actions', () => {
  const items = [item('A', 60), item('B', 5), item('C', 30), item('D', 95, { workflow_status: 'done' })]
  const plans = buildNextActions(items, 2)
  assert.deepEqual(plans.map(p => p.item.external_id), ['B', 'C'], 'sorted by score, done excluded')
  assert.ok(plans[0].actions.length >= 1)
  assert.match(plans[0].actions[0].text, /Validate with linked evidence/)
  assert.ok(plans[0].actions.every(a => a.gain > 0))
})

test('groupNextActions prints each chore once with the items it applies to', () => {
  const plans = buildNextActions([item('A', 0), item('B', 0), item('C', 30, { validation_status: 'assumed' })], 3)
  const groups = groupNextActions(plans)
  const validation = groups.find(g => g.signal === 'validation')
  assert.deepEqual(validation.ids, ['A', 'B', 'C'], 'one group covers all three items')
  assert.equal(validation.maxGain, 40)
  assert.equal(validation.uniform, false, 'C has a smaller validation gap (assumed)')
  assert.equal(groups[0].signal, 'validation', 'sorted by biggest gain first')
  const totalLines = groups.length
  assert.ok(totalLines < plans.reduce((n, p) => n + p.actions.length, 0), 'fewer groups than raw action lines')
})

test('the workflow action asks for dependency declarations, not for "make progress"', () => {
  const plans = buildNextActions([item('A', 0)], 1)
  const workflow = plans[0].actions.find(a => a.signal === 'workflow')
  assert.match(workflow.text, /dependencies/i)
  assert.ok(!/progress the item/i.test(workflow.text))
})

test('follow-up issues are excluded from planning and flagged on their targets', () => {
  const target = item('A', 5)
  const followUp = item('F', 5, { title: `${FOLLOW_UP_PREFIX}${target.title} (5%)` })
  assert.ok(isFollowUp(followUp))
  const plans = buildNextActions([target, followUp], 5)
  assert.equal(plans.length, 1, 'the follow-up itself is not planned')
  assert.equal(plans[0].alreadyFiled, true)
})

test('the certainty-generated label marks an item tool-generated regardless of title', () => {
  assert.ok(isToolGenerated(item('G', 50, { labels: ['Certainty-Generated'] })))
  assert.ok(!isToolGenerated(item('H', 50, { labels: ['bug'] })))
})

test('already-filed detection works when tool-generated items are scored separately', () => {
  const target = item('A', 5)
  const filed = item('F', 5, { title: `${FOLLOW_UP_PREFIX}${target.title} (5%)`, labels: [GENERATED_LABEL] })
  const plans = buildNextActions([target], 5, [target, filed])
  assert.equal(plans[0].alreadyFiled, true)
})

test('createGitHubIssues posts one issue per unfiled plan', async () => {
  const posted = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, { body }) => {
    posted.push(JSON.parse(body))
    return { ok: true, json: async () => ({ html_url: 'https://x/issues/9' }), text: async () => '' }
  }
  try {
    const plans = buildNextActions([item('A', 5), item('B', 10)], 2)
    plans[1].alreadyFiled = true
    const created = await createGitHubIssues({ repo: 'o/r', token: 't' }, plans)
    assert.equal(created.length, 1)
    assert.match(posted[0].title, /^Raise certainty: Item A \(5%\)$/)
    assert.match(posted[0].body, /- \[ \] Validate with linked evidence/)
    assert.deepEqual(posted[0].labels, [GENERATED_LABEL], 'filed issues are labelled so later syncs never score them')
  } finally {
    globalThis.fetch = original
  }
})

test('createGitHubIssues refuses without repo or token', async () => {
  await assert.rejects(() => createGitHubIssues({}, []), /source: github/)
  await assert.rejects(() => createGitHubIssues({ repo: 'o/r' }, []), /write access/)
})
