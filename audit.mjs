#!/usr/bin/env node
// VAL'S website auditor.
//   node audit.mjs --urls https://a.com,https://b.com     audit specific sites
//   node audit.mjs                                       audit everything in prospects.csv
// Options: --csv file  --out dir  --runs N  --no-pdf  --skip-lighthouse
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as chromeLauncher from 'chrome-launcher';
import { runChecks } from './lib/checks.mjs';
import { runLighthouse } from './lib/lighthouse.mjs';
import { speedFindings, prioritise, opportunityScore } from './lib/findings.mjs';
import { renderReport } from './lib/report.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const outDir = opt('out', 'out');
const runs = Number(opt('runs', config.lighthouseRuns || 2));

function parseCsv(text) {
  const rows = [];
  let cur = [''], q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; }
      else if (ch === '"') q = false;
      else cur[cur.length - 1] += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') cur.push('');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      rows.push(cur); cur = [''];
    } else cur[cur.length - 1] += ch;
  }
  if (cur.length > 1 || cur[0]) rows.push(cur);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()])));
}

function loadProspects() {
  const urls = opt('urls', '');
  if (urls) {
    return urls.split(/[\s,]+/).filter(Boolean).map((u) => ({ url: u, name: '', trade: '', city: '', notes: '' }));
  }
  const csv = opt('csv', 'prospects.csv');
  return parseCsv(fs.readFileSync(csv, 'utf8')).filter((p) => p.url);
}

const normalise = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const slug = (u) => new URL(u).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

function toPdf(htmlPath, pdfPath) {
  try {
    const chrome = process.env.CHROME_PATH || chromeLauncher.Launcher.getFirstInstallation();
    execFileSync(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
      `--print-to-pdf=${path.resolve(pdfPath)}`, 'file://' + path.resolve(htmlPath),
    ], { stdio: 'ignore', timeout: 60000 });
    return true;
  } catch (e) {
    console.warn('  PDF conversion failed:', e.message);
    return false;
  }
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const prospects = loadProspects();
  if (!prospects.length) { console.error('No URLs to audit.'); process.exit(1); }
  if (!config.contact.email && !config.contact.phone && !config.contact.website) {
    console.warn('⚠  config.json has no contact details: the report footer will not tell prospects how to reach you.');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const summary = [];

  for (const p of prospects) {
    const url = normalise(p.url);
    const id = slug(url);
    console.log(`\n→ ${url}`);
    const dir = path.join(outDir, id);
    fs.mkdirSync(dir, { recursive: true });

    const checks = await runChecks(url, { city: p.city });
    let lh = { ok: false, error: 'skipped' };
    if (!flag('skip-lighthouse') && checks.reachable) {
      console.log(`  Lighthouse (${runs} run${runs > 1 ? 's' : ''})…`);
      lh = await runLighthouse(url, runs);
      if (!lh.ok) console.warn('  Lighthouse failed:', lh.error);
    }

    const findings = prioritise([...checks.findings, ...speedFindings(lh)]);
    const prospect = { ...p, url };
    const result = { prospect, date, lighthouse: lh, checks: { ...checks, findings: undefined }, findings };
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));

    const html = renderReport({ prospect, lh, findings, config, date });
    const htmlPath = path.join(dir, 'report.html');
    fs.writeFileSync(htmlPath, html);
    const pdfOk = flag('no-pdf') ? false : toPdf(htmlPath, path.join(dir, 'report.pdf'));

    const opp = opportunityScore(findings, lh);
    const row = {
      url, name: p.name, trade: p.trade, city: p.city,
      performance: lh.scores?.performance ?? '', seo: lh.scores?.seo ?? '',
      accessibility: lh.scores?.accessibility ?? '', best_practices: lh.scores?.['best-practices'] ?? '',
      high: findings.filter((f) => f.level === 'high').length,
      medium: findings.filter((f) => f.level === 'medium').length,
      opportunity: opp, platform: checks.facts?.platform ?? '', report: path.join(id, pdfOk ? 'report.pdf' : 'report.html'),
    };
    summary.push(row);
    console.log(`  Done · opportunity ${opp}/100 · ${row.high} high, ${row.medium} medium issues`);
  }

  summary.sort((a, b) => b.opportunity - a.opportunity);
  const cols = Object.keys(summary[0]);
  fs.writeFileSync(
    path.join(outDir, 'summary.csv'),
    [cols.join(','), ...summary.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n'
  );

  // Markdown table for the GitHub Actions job summary.
  const md = [
    '## VAL\'S audit results (best opportunities first)',
    '',
    '| Business | Speed | SEO | A11y | High | Med | Opportunity |',
    '|---|---|---|---|---|---|---|',
    ...summary.map((r) => `| ${r.name || r.url} | ${r.performance} | ${r.seo} | ${r.accessibility} | ${r.high} | ${r.medium} | **${r.opportunity}** |`),
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), md + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log('\n' + md);
}

main().catch((e) => { console.error(e); process.exit(1); });
