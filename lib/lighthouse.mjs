// Runs Lighthouse (mobile, default settings) N times in headless Chrome and averages the result.
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { UA } from './ua.mjs';

const CATEGORIES = ['performance', 'seo', 'accessibility', 'best-practices'];
const METRICS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
};
// Lighthouse audits already covered by our own checks (avoid duplicate findings).
const SKIP_AUDITS = new Set(['document-title', 'meta-description', 'viewport', 'image-alt']);

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

async function once(url) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const res = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORIES,
      emulatedUserAgent: UA,
    });
    const lhr = res.lhr;
    // Lighthouse can "succeed" with null scores when the page failed to load
    // (blocked by the host, timeout, no content painted). Surface that as an error.
    if (lhr.runtimeError || lhr.categories?.performance?.score == null) {
      const e = lhr.runtimeError || {};
      throw new Error(`${e.code || 'NO_SCORE'}: ${e.message || 'Lighthouse returned no scores for this page'}`);
    }
    return lhr;
  } finally {
    await chrome.kill();
  }
}

export async function runLighthouse(url, runs = 2) {
  const lhrs = [];
  const errors = [];
  for (let i = 0; i < runs; i++) {
    try {
      lhrs.push(await once(url));
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }
  if (!lhrs.length) return { ok: false, error: errors.join(' | ') };

  const scores = {};
  for (const c of CATEGORIES) {
    const vals = lhrs.map((l) => l.categories[c]?.score).filter((v) => typeof v === 'number');
    scores[c] = vals.length ? Math.round(avg(vals) * 100) : null;
  }

  const metrics = {};
  for (const [k, id] of Object.entries(METRICS)) {
    const vals = lhrs.map((l) => l.audits[id]?.numericValue).filter((v) => typeof v === 'number');
    metrics[k] = vals.length ? avg(vals) : null;
  }

  // Failed audits from the last run, for extra "Lighthouse flagged" findings.
  const last = lhrs[lhrs.length - 1];
  const failed = [];
  for (const cat of ['seo', 'accessibility']) {
    for (const ref of last.categories[cat]?.auditRefs || []) {
      const a = last.audits[ref.id];
      if (a && a.score === 0 && !SKIP_AUDITS.has(a.id)) {
        failed.push({ category: cat, id: a.id, title: a.title });
      }
    }
  }

  return { ok: true, runs: lhrs.length, scores, metrics, failed, errors };
}
