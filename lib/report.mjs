// Renders the one-page, US-Letter website health check as a self-contained HTML file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prioritise, recommendation, sec } from './findings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLORS = { good: '#16a34a', mid: '#d97706', bad: '#dc2626', none: '#94a3b8' };
const scoreColor = (s) => (s == null ? COLORS.none : s >= 90 ? COLORS.good : s >= 50 ? COLORS.mid : COLORS.bad);
const levelLabel = { high: 'Fix first', medium: 'Important', low: 'Nice to fix', good: 'Working' };
const levelColor = { high: COLORS.bad, medium: COLORS.mid, low: '#64748b', good: COLORS.good };

function ring(label, score) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  const col = scoreColor(score);
  return `
  <div class="ring">
    <svg viewBox="0 0 76 76" width="76" height="76">
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="7"/>
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 38 38)"/>
      <text x="38" y="44" text-anchor="middle" font-size="21" font-weight="700" fill="#0f172a">${score ?? '–'}</text>
    </svg>
    <div class="ring-label">${esc(label)}</div>
  </div>`;
}

function metric(label, value, note) {
  return `<div class="metric"><div class="metric-v">${esc(value)}</div><div class="metric-l">${esc(label)}</div><div class="metric-n">${esc(note)}</div></div>`;
}

export function renderReport({ prospect, lh, findings, config, date }) {
  const logo = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.png')).toString('base64');
  const sorted = prioritise(findings);
  const issues = sorted.filter((f) => f.level !== 'good').slice(0, 5);
  const goods = sorted.filter((f) => f.level === 'good').slice(0, 3);
  const rec = recommendation(prospect.trade);
  const s = lh?.ok ? lh.scores : {};
  const m = lh?.ok ? lh.metrics : {};
  const contact = [config.contact?.phone, config.contact?.email, config.contact?.website].filter(Boolean).join('  ·  ');

  const metrics = lh?.ok
    ? [
        metric('Main content appears', m.lcp != null ? `${sec(m.lcp)} s` : '–', 'Goal: 2.5 s or less'),
        metric('Layout stability', m.cls != null ? m.cls.toFixed(2) : '–', 'Goal: 0.10 or less'),
        metric('Responsiveness delay', m.tbt != null ? `${Math.round(m.tbt)} ms` : '–', 'Goal: 200 ms or less'),
      ].join('')
    : '<div class="metric-l">Speed test could not be completed for this site.</div>';

  const issueRows = issues.length
    ? issues
        .map(
          (f) => `<li><span class="tag" style="background:${levelColor[f.level]}">${levelLabel[f.level]}</span>
          <div><div class="i-title">${esc(f.title)}</div><div class="i-impact">${esc(f.impact)}</div></div></li>`
        )
        .join('')
    : '<li><div><div class="i-title">No major problems found.</div></div></li>';

  const goodRows = goods.map((f) => `<li>✓ ${esc(f.title)}</li>`).join('');
  const notes = prospect.notes && !/^replace with/i.test(prospect.notes)
    ? `<div class="notes"><b>A note from us:</b> ${esc(prospect.notes)}</div>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Website Health Check – ${esc(prospect.name || prospect.url)}</title>
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; }
  .page { width: 8.5in; height: 10.98in; max-height: 10.98in; overflow: hidden; position: relative; }
  header { background: #00060e; padding: 14px 36px; display: flex; align-items: center; justify-content: space-between; }
  header img { height: 58px; mix-blend-mode: lighten; }
  header .ttl { color: #fff; text-align: right; }
  header .ttl b { display: block; font-size: 17px; letter-spacing: .02em; }
  header .ttl span { color: #38bdf8; font-size: 11px; }
  .accent { height: 4px; background: linear-gradient(90deg,#38bdf8,#00d1ff); }
  main { padding: 20px 36px 0; }
  .for { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
  .for h1 { font-size: 20px; margin: 0; }
  .for .sub { font-size: 11px; color: #64748b; }
  .rings { display: flex; justify-content: space-between; margin: 16px 0 6px; }
  .ring { text-align: center; width: 24%; }
  .ring-label { font-size: 11px; font-weight: 600; color: #334155; margin-top: 2px; }
  .metrics { display: flex; gap: 10px; margin: 8px 0 14px; }
  .metric { flex: 1; background: #f1f5f9; border-radius: 8px; padding: 8px 10px; }
  .metric-v { font-size: 17px; font-weight: 700; }
  .metric-l { font-size: 10.5px; color: #475569; }
  .metric-n { font-size: 9.5px; color: #94a3b8; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #0369a1; margin: 12px 0 6px; }
  ul.issues { list-style: none; margin: 0; padding: 0; }
  ul.issues li { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; align-items: flex-start; }
  .tag { color: #fff; font-size: 9px; font-weight: 700; padding: 3px 7px; border-radius: 999px; white-space: nowrap; margin-top: 2px; min-width: 62px; text-align: center; }
  .i-title { font-size: 12.5px; font-weight: 600; }
  .i-impact { font-size: 11px; color: #475569; }
  ul.good { list-style: none; padding: 0; margin: 0; font-size: 11.5px; color: #166534; columns: 1; }
  .rec { margin-top: 12px; background: #050b14; color: #fff; border-radius: 10px; padding: 12px 16px; border-left: 5px solid #38bdf8; }
  .rec small { color: #38bdf8; text-transform: uppercase; letter-spacing: .08em; font-size: 9.5px; font-weight: 700; }
  .rec .h { font-size: 14.5px; font-weight: 700; margin: 3px 0; }
  .rec .b { font-size: 11.5px; color: #cbd5e1; }
  .notes { margin-top: 10px; font-size: 11.5px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 8px 12px; }
  footer { position: absolute; bottom: 0; left: 0; right: 0; padding: 10px 36px 14px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #64748b; }
  footer .c { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
</style></head>
<body><div class="page">
  <header>
    <img src="data:image/png;base64,${logo}" alt="${esc(config.brand)}">
    <div class="ttl"><b>Website Health Check</b><span>${esc(date)}</span></div>
  </header>
  <div class="accent"></div>
  <main>
    <div class="for">
      <div><h1>${esc(prospect.name || new URL(prospect.url).hostname)}</h1>
      <div class="sub">${esc(prospect.url)}${prospect.city ? ' · ' + esc(prospect.city) + ', PA' : ''}</div></div>
      <div class="sub">Tested on a simulated mobile phone</div>
    </div>
    <div class="rings">
      ${ring('Mobile speed', s.performance)}
      ${ring('Search (SEO)', s.seo)}
      ${ring('Accessibility', s.accessibility)}
      ${ring('Best practices', s['best-practices'])}
    </div>
    <div class="metrics">${metrics}</div>
    <h2>What to fix first</h2>
    <ul class="issues">${issueRows}</ul>
    ${goodRows ? `<h2>What is already working</h2><ul class="good">${goodRows}</ul>` : ''}
    <div class="rec"><small>Our recommendation</small><div class="h">${esc(rec.headline)}</div><div class="b">${esc(rec.body)}</div></div>
    ${notes}
  </main>
  <footer>
    <div class="c">${esc(config.brand)}${contact ? '  ·  ' + esc(contact) : ''}</div>
    ${esc(config.tagline)} · Serving ${esc(config.serviceArea)}<br>
    Results come from automated lab tests (Google Lighthouse) and a review of the public page; real-world numbers can vary.
  </footer>
</div></body></html>`;
}
