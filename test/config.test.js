import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadConfig } from '../src/config.js'

function writeConfig(yaml) {
  const path = join(mkdtempSync(join(tmpdir(), 'certainty-test-')), 'config.yaml')
  writeFileSync(path, yaml)
  return path
}

test('loads yaml and expands env vars', () => {
  process.env.CERTAINTY_TEST_KEY = 'secret123'
  const config = loadConfig(writeConfig('source: linear\nlinear:\n  apiKey: ${CERTAINTY_TEST_KEY}\n'))
  assert.equal(config.linear.apiKey, 'secret123')
  delete process.env.CERTAINTY_TEST_KEY
})

test('throws on missing env var', () => {
  assert.throws(
    () => loadConfig(writeConfig('key: ${CERTAINTY_DEFINITELY_UNSET_VAR}\n')),
    /Missing env var: CERTAINTY_DEFINITELY_UNSET_VAR/
  )
})

test('throws a helpful error when the file does not exist', () => {
  assert.throws(() => loadConfig('/nonexistent/certainty.config.yaml'), /Config file not found/)
})
