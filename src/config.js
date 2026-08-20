import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import yaml from 'js-yaml'

const CONFIG_FILE = 'certainty.config.yaml'

export function loadConfig(filePath) {
  const path = resolve(filePath ?? CONFIG_FILE)
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}\nRun: certainty-scan init`)
  }
  const raw = readFileSync(path, 'utf8')
  const config = yaml.load(raw)

  // Expand env vars like ${MY_VAR}
  const json = JSON.stringify(config)
  const expanded = json.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const val = process.env[key]
    if (!val) throw new Error(`Missing env var: ${key}`)
    return val
  })
  return JSON.parse(expanded)
}

export const CONFIG_TEMPLATE = `# certainty-scan configuration
# Docs: https://github.com/2ngnhan/certainty-scan

project: My Project

# Choose one source: linear | jira | notion | github
source: linear

linear:
  apiKey: \${LINEAR_API_KEY}
  teamId: your-team-id   # from Linear team URL

  # Optional: override field mappings
  # fieldMap:
  #   validation_status:
  #     field: state.type
  #     map:
  #       completed: validated
  #       started: assumed
  #   tier:
  #     field: estimate
  #     map:
  #       1: basic
  #       3: intermediate
  #       8: advanced

# jira:
#   host: yourteam.atlassian.net
#   email: you@example.com
#   apiToken: \${JIRA_API_TOKEN}
#   projectKey: MYPROJECT

# github:
#   repo: owner/name
#   token: \${GITHUB_TOKEN}   # optional for public repos

# notion:
#   apiKey: \${NOTION_API_KEY}
#   databaseId: your-database-id
#   fieldMap:
#     title_field: { field: Name }
#     validation_status:
#       field: Status
#       map:
#         Done: validated
#         "In Progress": assumed

output:
  html: certainty-report.html
  markdown: certainty-report.md   # optional — remove to skip
`

// Appended by `init --research <pair-id>`: separates the pilot experience from
// the free tool. The pair id is issued by the research team after consent.
export function researchConfigBlock(pairId) {
  return `
# Research mode (pilot study). Issued after consent; see certainty.naucode.io/pilot-vi/
research:
  pairId: ${pairId}
  consent: true
  consentedAt: ${new Date().toISOString()}
  # keyEndpoint: https://…   # when absent, the sealing key is written to certainty-key.txt
`
}
