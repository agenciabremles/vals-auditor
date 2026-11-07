// Turns Lighthouse numbers into plain-English findings and prioritises everything.
const ORDER = { high: 0, medium: 1, low: 2, good: 3 };

export const sec = (ms) => (ms / 1000).toFixed(1);

export function speedFindings(lh) {
  const out = [];
  if (!lh?.ok) return out;
  const { scores, metrics } = lh;
  const add = (level, id, title, impact) => out.push({ id, level, title, impact });

  if (scores.performance != null) {
    if (scores.performance < 50) {
      add('high', 'perf', `Slow on phones (speed score ${scores.performance}/100)`,
        'Slow pages lose visitors before they ever see your offer.');
    } else if (scores.performance < 90) {
      add('medium', 'perf', `Mobile speed could be better (${scores.performance}/100)`,
        'Faster pages keep more visitors and are favoured by Google.');
    } else {
      add('good', 'perf', `Fast on mobile (${scores.performance}/100)`, 'Visitors get the page quickly.');
    }
  }
  if (metrics.lcp != null && metrics.lcp > 2500) {
    add(metrics.lcp > 4000 ? 'high' : 'medium', 'lcp',
      `Main content takes ${sec(metrics.lcp)} seconds to appear on a phone`,
      'Google treats 2.5 seconds or less as good; slower pages risk losing the visitor.');
  }
  if (metrics.cls != null && metrics.cls > 0.1) {
    add(metrics.cls > 0.25 ? 'medium' : 'low', 'cls', 'The page jumps around while loading',
      'Layout shifts cause mis-taps on buttons and make the site feel unreliable.');
  }
  if (metrics.tbt != null && metrics.tbt > 300) {
    add(metrics.tbt > 600 ? 'medium' : 'low', 'tbt', 'The page is sluggish to respond after loading',
      'Heavy scripts make buttons feel frozen on average phones.');
  }
  if (scores.seo != null && scores.seo < 90) {
    add('medium', 'seo_score', `Search (SEO) basics score ${scores.seo}/100`,
      'Fixing the basics is the cheapest way to show up higher in local results.');
  }
  for (const f of (lh.failed || []).slice(0, 3)) {
    add('low', 'lh_' + f.id, f.title, f.category === 'seo'
      ? 'Flagged by Google Lighthouse (search visibility).'
      : 'Flagged by Google Lighthouse (accessibility, which affects every visitor and legal risk).');
  }
  return out;
}

export function prioritise(findings) {
  return [...findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

// Internal lead score (0-100): higher = bigger opportunity for VAL'S. Not shown to the prospect.
export function opportunityScore(findings, lh) {
  const high = findings.filter((f) => f.level === 'high').length;
  const med = findings.filter((f) => f.level === 'medium').length;
  const low = findings.filter((f) => f.level === 'low').length;
  const slow = lh?.ok && lh.scores.performance != null ? (100 - lh.scores.performance) * 0.25 : 0;
  return Math.min(100, Math.round(high * 14 + med * 7 + low * 2 + slow));
}

export function recommendation(trade = '') {
  const t = trade.toLowerCase();
  if (/roof|construct|contract|remodel|paint|plumb|electric|hvac|landscap|concrete|builder|mason|deck|fence|handyman/.test(t)) {
    return {
      headline: 'A fast mobile site with an instant online quote calculator',
      body: 'Let visitors describe the job and get a ballpark price or request an estimate in under a minute, with a tap-to-call button always in reach.',
    };
  }
  if (/salon|beauty|barber|spa|nail|massage|lash|brow|wellness/.test(t)) {
    return {
      headline: 'A mobile-first site with built-in online booking',
      body: 'Clients pick a service and time themselves, 24/7, and you stop playing phone tag.',
    };
  }
  if (/restaurant|cafe|bar|pizza|bakery|food|catering|grill/.test(t)) {
    return {
      headline: 'A fast site with a QR-code digital menu',
      body: 'A menu that is always up to date, easy to open from a table or a Google listing, and simple to change yourself.',
    };
  }
  if (/dent|medical|clinic|doctor|chiropract|therap|vet|health|physio/.test(t)) {
    return {
      headline: 'A trust-first site with online appointment requests',
      body: 'Patients can request a visit in a minute, outside office hours, and you get fewer missed calls.',
    };
  }
  if (/clean|maid|janitor|pressure|wash|detail/.test(t)) {
    return {
      headline: 'A conversion-focused landing page with instant quote requests',
      body: 'A clear offer, a short form, reviews up front and a one-tap call button for every service area.',
    };
  }
  return {
    headline: 'A fast, mobile-first site with a clear call to action',
    body: 'A tap-to-call button, a short contact form and local trust signals, so more of your visitors become customers.',
  };
}
