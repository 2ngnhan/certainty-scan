#!/usr/bin/env node
import { program } from 'commander'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import { loadConfig, CONFIG_TEMPLATE, researchConfigBlock } from './config.js'
import {
  scoreItems, biggestGaps, computeMetrics, INSTRUMENT_VERSION,
} from './certainty.js'
import { generateHTML, generateMarkdown } from './report.js'
import { loadHistory, appendSnapshot, diffAgainstLast } from './history.js'
import { buildNextActions, groupNextActions, createGitHubIssues, isToolGenerated } from './actions.js'
import {
  generateKey, seal, unseal, buildResearchExport, generateRatingSheetHTML, applyRatings,
} from './research.js'

// Lazy-load adapters by source name
async function loadAdapter(source) {
  const adapters = {
    linear: './adapters/linear.js',
    jira:   './adapters/jira.js',
    notion: './adapters/notion.js',
    github: './adapters/github.js',
  }
  const path = adapters[source]
  if (!path) throw new Error(`Unknown source: "${source}". Supported: ${Object.keys(adapters).join(', ')}`)
  return import(path)
}

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)

// Shared by sync and next: load config, fetch from the source, score everything.
// Research mode resolves the pair id, turns on deep comment fetching, and is
// carried through so downstream steps can seal / export / stamp correctly.
async function fetchAndScore(opts, { score = true } = {}) {
  let config
  try {
    config = loadConfig(opts.config)
  } catch (e) {
    console.error(chalk.red('Error: ') + e.message)
    process.exit(1)
  }

  // A config enrolled in the pilot never runs open-scored commands: a plain
  // sync or next would print and write every score while the results are
  // supposed to be sealed (the H1 protection would leak out the side door).
  if (score && !opts.research && config.research?.pairId) {
    console.error(chalk.red('Error: ') + `this config is enrolled in the research pilot (pair ${config.research.pairId}), so scores stay sealed until the PM rating is in.`)
    console.error('  Run:  certainty-scan sync --research')
    console.error('  Remove the research block from certainty.config.yaml only if your team has left the study.')
    process.exit(1)
  }

  let research = null
  if (opts.research) {
    const pairId = opts.pairId ?? config.research?.pairId
    if (!pairId) {
      console.error(chalk.red('Error: ') + 'research mode needs a pair id. Run: certainty-scan init --research <pair-id>  (or pass --pair-id)')
      process.exit(1)
    }
    research = {
      pairId,
      consent: config.research?.consent === true,
      keyEndpoint: config.research?.keyEndpoint ?? null,
      mode: opts.retrospective ? 'retrospective' : 'active',
      revealedFirst: Boolean(opts.revealNow),
      toolVersion: version,
    }
  }

  const source = opts.source ?? config.source
  console.log(chalk.dim(`Fetching from ${source}…`))

  let adapter
  try {
    adapter = await loadAdapter(source)
  } catch (e) {
    console.error(chalk.red('Error: ') + e.message)
    process.exit(1)
  }

  // resolve the source config first so setting flags on it cannot shadow a
  // flat (top-level) config; decision-based Discussion needs comment bodies,
  // which is only worth the extra requests in research mode
  const sourceConfig = config[source] ?? config
  if (research && source === 'github') sourceConfig.deep = true

  let items
  try {
    items = await adapter.fetchItems(sourceConfig)
  } catch (e) {
    console.error(chalk.red(`Failed to fetch from ${source}: `) + e.message)
    process.exit(1)
  }

  // anti-circularity rule 2: items the tool itself filed are never scored
  const toolGenerated = items.filter(isToolGenerated)
  items = items.filter(i => !isToolGenerated(i))
  if (toolGenerated.length) {
    console.log(chalk.dim(`  ${toolGenerated.length} tool-generated item${toolGenerated.length === 1 ? '' : 's'} (certainty-generated) excluded from scoring`))
  }

  if (score) scoreItems(items)

  return { config, source, items, toolGenerated, research }
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0
}

// Stage-3 transparency step: show exactly what would be read, score nothing,
// write nothing. The team confirms this manifest before the real run.
async function runDryRun(opts) {
  const { items, research } = await fetchAndScore(opts, { score: false })
  const n = items.length
  const emptyDesc = items.filter(i => !(i.description ?? '').trim()).length
  const withAC = items.filter(i => i.acceptance_criteria?.trim()).length
  const withComments = items.filter(i => (i.citation_count ?? 0) > 0 || i.comments_text?.length).length
  const withLinks = items.filter(i => i.linked_evidence).length
  const withDeps = items.filter(i => i.dependencies?.length).length

  console.log()
  console.log(chalk.bold('Metadata read scope (manifest):'))
  console.log('  reads:      item titles, descriptions, workflow status, labels,')
  console.log('              dependency links, linked commit/PR references, discussion threads,')
  console.log('              assignee names (kept local, never in the research export), timestamps')
  console.log('  never read: source code, files outside the tracker, anything else on this machine')
  console.log('  leaves this machine: nothing, until you deliberately send a result file')
  console.log()
  console.log(chalk.bold(`${n} items visible`) + (research ? chalk.dim(`  ·  pair ${research.pairId}  ·  instrument v${INSTRUMENT_VERSION}`) : ''))
  console.log(`  ${pct(emptyDesc, n)}% empty descriptions · ${pct(withAC, n)}% with acceptance criteria · ` +
    `${pct(withComments, n)}% with comments · ${pct(withLinks, n)}% with commit/PR links · ${pct(withDeps, n)}% with declared dependencies`)
  if (n && emptyDesc / n > 0.5) {
    console.log(chalk.yellow('  ⚠ more than half of the descriptions are empty. The audit will still run,') )
    console.log(chalk.yellow('    but flag this to the research contact before continuing.'))
  }
  console.log()
  console.log(chalk.dim('Dry run: no scores computed, no files written.'))
}

function printScoreSummary(items) {
  const metrics = computeMetrics(items)
  const scores = items.map(i => i.certainty_score ?? 0)
  const high   = scores.filter(s => s >= 80).length
  const medium = scores.filter(s => s >= 50 && s < 80).length
  const low    = scores.filter(s => s >= 20 && s < 50).length
  const unc    = scores.filter(s => s < 20).length
  console.log()
  console.log(chalk.bold(`${items.length} items  ·  avg certainty ${metrics.weightedAvgCertainty}% (tier-weighted)  ·  ${metrics.avgCertaintyScore}% unweighted`))
  console.log(
    chalk.green(`  high ${high}`) + '  ' +
    chalk.blue(`medium ${medium}`) + '  ' +
    chalk.yellow(`low ${low}`) + '  ' +
    chalk.red(`uncertain ${unc}`)
  )
  return metrics
}

// Sealed Reveal: score, encrypt, and keep every score off the console so the
// PM's independent rating stays independent (H1).
async function runSealedResearchSync(opts, fetched) {
  const { config, items, research } = fetched
  const retro = research.mode === 'retrospective'
  const projectName = config.project ?? 'Project'

  // The anonymized export contains scores, so it is generated at unseal time,
  // never written in plaintext while the results are still sealed.
  const payload = { items, meta: { projectName, research } }
  const key = generateKey()

  const sealedPath = retro ? 'certainty-benchmark.sealed' : 'certainty-report.sealed'
  writeFileSync(sealedPath, seal(payload, key, research))

  let keyDelivered = false
  if (research.keyEndpoint) {
    try {
      const res = await fetch(research.keyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair_id: research.pairId, mode: research.mode, key,
          instrument_version: INSTRUMENT_VERSION,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      keyDelivered = true
    } catch (e) {
      console.error(chalk.yellow(`  key endpoint unreachable (${e.message}), falling back to a local key file`))
    }
  }

  const keyPath = retro ? 'certainty-benchmark-key.txt' : 'certainty-key.txt'
  if (!keyDelivered) {
    writeFileSync(keyPath, [
      `certainty-scan sealing key · pair ${research.pairId} · ${research.mode}`,
      key,
      '',
      'Send this file to the research contact now, then delete it locally.',
      'Do not open the .sealed file before the PM rating is submitted.',
    ].join('\n'))
  }

  if (!retro) {
    writeFileSync('certainty-rating-sheet.html', generateRatingSheetHTML(items, { pairId: research.pairId }))
  }

  // Console: counts and paths only. No scores in sealed mode.
  console.log()
  console.log(chalk.bold(`${items.length} items read and scored. Results are sealed.`))
  console.log(chalk.green('✓') + ` ${sealedPath}` + chalk.dim('  (encrypted results, nobody can read them yet)'))
  if (!retro) console.log(chalk.green('✓') + ' certainty-rating-sheet.html' + chalk.dim('  (the PM\'s independent rating form, opens locally)'))
  if (keyDelivered) {
    console.log(chalk.green('✓') + ' sealing key sent to the research endpoint' + chalk.dim(' (no scores were sent, only the key)'))
  } else {
    console.log(chalk.green('✓') + ` ${keyPath}` + chalk.dim('  (the sealing key)'))
  }
  console.log()
  console.log(chalk.bold('Next steps:'))
  let step = 1
  if (!keyDelivered) {
    console.log(`  ${step++}. Send ${keyPath} to the research contact now, then delete it. Do not open ${sealedPath}.`)
  }
  if (retro) {
    console.log(`  ${step++}. The benchmark stays sealed until the reveal session; it opens together with the active audit.`)
    console.log(`  ${step++}. When you receive the key:  npx certainty-scan unseal --key <key> --file ${sealedPath}`)
  } else {
    console.log(`  ${step++}. The PM opens certainty-rating-sheet.html (10-15 min) and exports rating.json.`)
    console.log(`  ${step++}. Send rating.json to the research contact; you receive the unsealing key back.`)
    console.log(`  ${step++}. npx certainty-scan unseal --key <key> --rating rating.json`)
  }
  console.log()
  console.log(chalk.dim(`pair ${research.pairId} · instrument v${INSTRUMENT_VERSION} · nothing left this machine${keyDelivered ? ' except the key' : ''}`))
}

// Research fallback for partners who decline sealing: run open, but stamp
// revealed_first so the pair is excluded from H1 (kept for H2/H3).
function runRevealedResearchSync(fetched) {
  const { config, items, research } = fetched
  const projectName = config.project ?? 'Project'
  const exportData = buildResearchExport(items, research)

  writeFileSync('certainty-report.html', generateHTML(items, projectName, { research: { pairId: research.pairId } }))
  console.log(chalk.green('✓') + ' certainty-report.html')
  writeFileSync('certainty-research-export.json', JSON.stringify(exportData, null, 2))
  console.log(chalk.green('✓') + ' certainty-research-export.json' + chalk.dim('  (anonymized: item ids and scores, hashed titles)'))
  writeFileSync('certainty-rating-sheet.html', generateRatingSheetHTML(items, { pairId: research.pairId }))
  console.log(chalk.green('✓') + ' certainty-rating-sheet.html')

  console.log()
  console.log(chalk.yellow('⚠ revealed_first: true. Results were revealed before the PM rating.'))
  console.log(chalk.yellow('  This pair is excluded from the machine-vs-PM comparison (H1) but still counts for the rest.'))
  printScoreSummary(items)
}

program
  .name('certainty-scan')
  .description('Certainty scoring for project work items')
  .version(version)

program
  .command('init')
  .description('Create a certainty.config.yaml template in the current directory')
  .option('--research <pairId>', 'pilot research mode: record the issued pair id and consent flag')
  .action((opts) => {
    let content = CONFIG_TEMPLATE
    if (opts.research) content += researchConfigBlock(opts.research)
    writeFileSync('certainty.config.yaml', content)
    console.log(chalk.green('✓') + ' Created certainty.config.yaml')
    console.log('  Edit it with your API keys, then run: certainty-scan sync')
    if (opts.research) {
      console.log()
      console.log(chalk.bold(`Research mode enabled (pair ${opts.research}, instrument v${INSTRUMENT_VERSION}).`))
      console.log('  · reads work item metadata only: titles, descriptions, statuses, labels,')
      console.log('    dependencies, commit/PR links, discussion. Never source code, never personal data.')
      console.log('  · next step:  certainty-scan sync --research --dry-run   (shows the manifest, scores nothing)')
      console.log('  · real run:   certainty-scan sync --research             (results are sealed until the PM rating)')
    }
  })

program
  .command('sync')
  .description('Fetch items from your tool and compute certainty scores')
  .option('-c, --config <path>', 'path to config file', 'certainty.config.yaml')
  .option('--source <name>', 'override source from config')
  .option('--json', 'also write certainty-data.json')
  .option('--fail-below <score>', 'exit with code 1 if average certainty is below this (CI gate)')
  .option('--slack-webhook <url>', 'post the summary to a Slack incoming webhook')
  .option('--no-history', 'skip reading/writing the snapshot history file')
  .option('--research', 'pilot research mode: sealed results, anonymized export, version stamp')
  .option('--pair-id <id>', 'override the pair id from the config (research mode)')
  .option('--dry-run', 'print the metadata read manifest and item counts; score nothing, write nothing')
  .option('--retrospective', 'research mode: audit a completed benchmark project')
  .option('--reveal-now', 'research mode: skip sealing (the pair is flagged and excluded from H1)')
  .action(async (opts) => {
    if ((opts.retrospective || opts.revealNow || opts.pairId) && !opts.research) {
      console.error(chalk.red('Error: ') + '--retrospective, --reveal-now, and --pair-id require --research')
      process.exit(1)
    }
    if (opts.research && (opts.slackWebhook || opts.failBelow !== undefined || opts.json)) {
      console.error(chalk.red('Error: ') + '--research cannot be combined with --slack-webhook, --fail-below, or --json (research results stay sealed and anonymized)')
      process.exit(1)
    }
    if (opts.dryRun) return runDryRun(opts)

    const fetched = await fetchAndScore(opts)
    const { config, items, research } = fetched
    console.log(chalk.dim(`  ${items.length} items fetched. Computing certainty scores…`))

    if (research) {
      // no history, no slack, no side files in research mode
      if (research.revealedFirst) return runRevealedResearchSync(fetched)
      return runSealedResearchSync(opts, fetched)
    }

    const projectName = config.project ?? 'Project'
    const out = config.output ?? {}

    // summary numbers (needed before history/slack)
    const scores = items.map(i => i.certainty_score)
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const velocity = computeMetrics(items).velocity

    // compare against the previous sync, then record this one
    let diff = null
    if (opts.history) {
      const historyPath = out.history ?? '.certainty-history.json'
      const history = loadHistory(historyPath)
      diff = diffAgainstLast(history, items, avg, velocity)
      appendSnapshot(historyPath, history, items, avg, velocity)
    }

    const htmlPath = out.html ?? 'certainty-report.html'
    writeFileSync(htmlPath, generateHTML(items, projectName))
    console.log(chalk.green('✓') + ` ${htmlPath}`)

    if (out.markdown) {
      writeFileSync(out.markdown, generateMarkdown(items, projectName))
      console.log(chalk.green('✓') + ` ${out.markdown}`)
    }

    if (opts.json) {
      writeFileSync('certainty-data.json', JSON.stringify(items, null, 2))
      console.log(chalk.green('✓') + ' certainty-data.json')
    }

    const metrics = printScoreSummary(items)
    const high   = scores.filter(s => s >= 80).length
    const medium = scores.filter(s => s >= 50 && s < 80).length
    const low    = scores.filter(s => s >= 20 && s < 50).length
    const unc    = scores.filter(s => s < 20).length

    // What moved since the previous sync
    if (diff) {
      const arrow = diff.avgDelta > 0 ? chalk.green(`▲ +${diff.avgDelta}`)
        : diff.avgDelta < 0 ? chalk.red(`▼ ${diff.avgDelta}`)
        : chalk.dim('unchanged')
      console.log()
      console.log(chalk.bold(`Since last sync (${diff.since.slice(0, 10)}):`) +
        `  avg ${diff.avgBefore}% → ${diff.avgNow}%  ${arrow}` +
        (diff.newItems ? chalk.dim(`  ·  ${diff.newItems} new item${diff.newItems === 1 ? '' : 's'}`) : ''))
      for (const m of diff.drops.slice(0, 3)) {
        console.log(chalk.red(`  ▼ ${m.prev} → ${m.now}`) + `  ${chalk.dim(m.item.external_id)}  ${m.item.title.slice(0, 55)}`)
      }
      for (const m of diff.rises.slice(0, 3)) {
        console.log(chalk.green(`  ▲ ${m.prev} → ${m.now}`) + `  ${chalk.dim(m.item.external_id)}  ${m.item.title.slice(0, 55)}`)
      }
      if (diff.debt) {
        console.log(chalk.yellow(
          `  ⚠ certainty debt: delivery volume ${diff.velocityBefore} → ${diff.velocityNow} while certainty ` +
          `${diff.avgBefore}% → ${diff.avgNow}%. Output is accelerating faster than validation.`
        ))
      }
    }

    // Instant insight: the least certain open items, and what would fix them
    const risky = items
      .filter(i => i.workflow_status !== 'done' && (i.certainty_score ?? 0) < 50)
      .sort((a, b) => (a.certainty_score ?? 0) - (b.certainty_score ?? 0))
      .slice(0, 5)

    if (risky.length) {
      console.log()
      console.log(chalk.bold('Least certain open items:'))
      for (const item of risky) {
        const gaps = biggestGaps(item)
          .map(g => `${g.signal} +${g.gap}`)
          .join(', ')
        console.log(
          `  ${chalk.red(String(item.certainty_score).padStart(3) + '%')} ` +
          `${chalk.dim(item.external_id)}  ${item.title.slice(0, 60)}`
        )
        console.log(chalk.dim(`        missing: ${gaps}`))
      }
    }

    // Post summary to Slack
    const webhook = opts.slackWebhook ?? out.slackWebhook
    if (webhook) {
      const deltaText = diff
        ? ` (${diff.avgDelta > 0 ? '+' : ''}${diff.avgDelta} since ${diff.since.slice(0, 10)})`
        : ''
      const lines = [
        `*Certainty Units — ${projectName}*`,
        `${items.length} items · avg certainty ${avg}%${deltaText} · tier-weighted ${metrics.weightedAvgCertainty}%`,
        `high ${high} · medium ${medium} · low ${low} · uncertain ${unc}`,
      ]
      if (diff?.debt) {
        lines.push(`:warning: *Certainty debt:* delivery volume ${diff.velocityBefore} → ${diff.velocityNow} while certainty ${diff.avgBefore}% → ${diff.avgNow}%`)
      }
      if (risky.length) {
        lines.push('', '*Least certain open items:*')
        for (const item of risky) {
          const gaps = biggestGaps(item).map(g => `${g.signal} +${g.gap}`).join(', ')
          lines.push(`• <${item.url}|${item.external_id}> ${item.certainty_score}% — ${item.title.slice(0, 60)} _(missing: ${gaps})_`)
        }
      }
      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: lines.join('\n') }),
        })
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
        console.log(chalk.green('✓') + ' posted summary to Slack')
      } catch (e) {
        console.error(chalk.red('Slack webhook failed: ') + e.message)
      }
    }

    // CI gate
    if (opts.failBelow !== undefined) {
      const threshold = Number(opts.failBelow)
      if (Number.isNaN(threshold)) {
        console.error(chalk.red('Error: ') + '--fail-below must be a number')
        process.exit(1)
      }
      if (avg < threshold) {
        console.error(chalk.red(`\n✗ average certainty ${avg}% is below the ${threshold}% gate`))
        process.exit(1)
      }
      console.log(chalk.green(`\n✓ average certainty ${avg}% meets the ${threshold}% gate`))
    }
  })

program
  .command('unseal')
  .description('Open a sealed research report with the key from the research contact')
  .requiredOption('--key <hex>', 'unsealing key')
  .option('--file <path>', 'sealed file (default: certainty-report.sealed, else certainty-benchmark.sealed)')
  .option('--rating <path>', 'rating.json exported from the PM rating sheet (default: ./rating.json if present)')
  .action((opts) => {
    const file = opts.file
      ?? (existsSync('certainty-report.sealed') ? 'certainty-report.sealed'
        : existsSync('certainty-benchmark.sealed') ? 'certainty-benchmark.sealed' : null)
    if (!file || !existsSync(file)) {
      console.error(chalk.red('Error: ') + 'no sealed file found. Expected certainty-report.sealed (or pass --file)')
      process.exit(1)
    }

    let payload, envelope
    try {
      ;({ payload, envelope } = unseal(readFileSync(file, 'utf8'), opts.key.trim()))
    } catch (e) {
      console.error(chalk.red('Error: ') + e.message)
      process.exit(1)
    }

    const { items, meta } = payload
    const research = meta.research ?? {}
    const retro = envelope.mode === 'retrospective'

    // merge the PM's independent rating: the H1 comparison and the PM-assigned
    // tiers the aggregate is supposed to be weighted by. Never auto-picked for
    // the benchmark: rating.json belongs to the active project.
    const ratingPath = opts.rating ?? (!retro && existsSync('rating.json') ? 'rating.json' : null)
    let ratingResult = null
    if (ratingPath) {
      try {
        const rating = JSON.parse(readFileSync(ratingPath, 'utf8'))
        if (rating.pair_id && research.pairId && rating.pair_id !== research.pairId) {
          console.error(chalk.yellow(`⚠ rating pair (${rating.pair_id}) differs from sealed pair (${research.pairId})`))
        }
        ratingResult = applyRatings(items, rating)
      } catch (e) {
        console.error(chalk.red('Could not read rating file: ') + e.message)
        process.exit(1)
      }
    }

    const reportPath = retro ? 'certainty-benchmark-report.html' : 'certainty-report.html'
    const exportPath = retro ? 'certainty-benchmark-export.json' : 'certainty-research-export.json'

    writeFileSync(reportPath, generateHTML(items, meta.projectName ?? 'Project', {
      research: { pairId: research.pairId, spearman: ratingResult?.spearman ?? null },
    }))
    console.log(chalk.green('✓') + ` ${reportPath}`)

    const exportData = buildResearchExport(items, {
      ...research, spearman: ratingResult?.spearman ?? null,
    })
    writeFileSync(exportPath, JSON.stringify(exportData, null, 2))
    console.log(chalk.green('✓') + ` ${exportPath}` + chalk.dim('  (anonymized: item ids and scores, hashed titles, no names)'))

    printScoreSummary(items)
    if (ratingResult) {
      console.log()
      const rho = ratingResult.spearman.rho
      console.log(chalk.bold('Delta view ready: ') +
        `${ratingResult.rated} items rated by the PM before the reveal` +
        (rho != null ? `  ·  Spearman ρ = ${rho}` : ''))
      console.log(chalk.dim('  The biggest machine-vs-PM gaps are highlighted in the report. They are the'))
      console.log(chalk.dim('  most valuable finding of the walkthrough, not anyone\'s mistake.'))
    } else if (!retro) {
      console.log()
      console.log(chalk.yellow('⚠ opened without a rating file. For the machine-vs-PM comparison (H1),'))
      console.log(chalk.yellow('  unseal again with:  --rating rating.json'))
    }
    console.log()
    console.log(chalk.dim(`If you agreed to share research data, send ${exportPath} to the research contact.`))
    console.log(chalk.dim('It is the only file that leaves your machine, and it contains no titles, no names, no code.'))
  })

program
  .command('next')
  .description('Turn the biggest certainty gaps into concrete next actions')
  .option('-c, --config <path>', 'path to config file', 'certainty.config.yaml')
  .option('--source <name>', 'override source from config')
  .option('-n, --limit <count>', 'how many items to plan for', '5')
  .option('--create-issues', 'file each plan as a follow-up issue in your repo (GitHub source only)')
  .action(async (opts) => {
    const { config, source, items, toolGenerated } = await fetchAndScore(opts)
    const plans = buildNextActions(items, Number(opts.limit) || 5, [...items, ...toolGenerated])

    if (!plans.length) {
      console.log(chalk.green('✓') + ' No open items below full certainty. Nothing to do.')
      return
    }

    console.log()
    console.log(chalk.bold(`Least certain open items (top ${plans.length}):`))
    for (const { item, alreadyFiled } of plans) {
      console.log(
        `  ${chalk.red(String(item.certainty_score ?? 0).padStart(3) + '%')} ` +
        `${chalk.dim(item.external_id)}  ${item.title.slice(0, 60)}` +
        (alreadyFiled ? chalk.dim('  (follow-up already filed)') : '')
      )
    }

    console.log()
    console.log(chalk.bold("This week's checklist:"))
    for (const g of groupNextActions(plans)) {
      const gain = g.uniform ? `+${g.maxGain}${g.ids.length > 1 ? ' each' : ''}` : `up to +${g.maxGain}`
      console.log(`  ${chalk.dim('□')} ${g.text}`)
      console.log(`      ${chalk.dim(g.ids.join(' '))}  ${chalk.green(`(${gain})`)}`)
    }

    if (opts.createIssues) {
      if (source !== 'github') {
        console.error(chalk.red('\n--create-issues currently supports source: github only'))
        process.exit(1)
      }
      try {
        const created = await createGitHubIssues(config.github, plans)
        console.log()
        if (!created.length) {
          console.log(chalk.dim('All of these already have open follow-up issues. Nothing filed.'))
        } else {
          console.log(chalk.green(`✓ filed ${created.length} follow-up issue${created.length === 1 ? '' : 's'} (labelled certainty-generated, excluded from scoring):`))
          for (const c of created) console.log(`    ${c.url}  ${chalk.dim(`(for ${c.for})`)}`)
        }
      } catch (e) {
        console.error(chalk.red('Failed to create issues: ') + e.message)
        process.exit(1)
      }
    }
  })

program
  .command('validate')
  .description('Check config file for required fields without making API calls')
  .option('-c, --config <path>', 'path to config file', 'certainty.config.yaml')
  .action((opts) => {
    try {
      const config = loadConfig(opts.config)
      console.log(chalk.green('✓') + ` Config is valid (source: ${config.source})`)
    } catch (e) {
      console.error(chalk.red('Invalid config: ') + e.message)
      process.exit(1)
    }
  })

program.parse()
