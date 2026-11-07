// Local-business checks that Lighthouse does not do: click-to-call, quote/booking CTA,
// reviews, local signals, etc. Plain fetch + cheerio, no browser needed.
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (compatible; ValsAuditor/1.0)';

async function fetchText(url, timeout = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' },
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, html };
  } finally {
    clearTimeout(t);
  }
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const CTA_RE = /\b(free\s+)?(quote|estimate|book(ing)?|schedule|appointment|reserve|get started|contact us|request)\b/i;
const PROOF_RE = /\b(reviews?|testimonials?|5[- ]star|google reviews|rated|stars?|what our (clients|customers))\b/i;
const LOCAL_TYPES = [
  'LocalBusiness', 'HomeAndConstructionBusiness', 'GeneralContractor', 'RoofingContractor',
  'Plumber', 'Electrician', 'HVACBusiness', 'HousePainter', 'LandscapingBusiness',
  'CleaningService', 'Restaurant', 'Dentist', 'MedicalBusiness', 'HairSalon', 'BeautySalon',
  'ProfessionalService', 'AutoRepair',
];

export async function runChecks(inputUrl, { city = '' } = {}) {
  const findings = [];
  const add = (level, id, title, impact) => findings.push({ id, level, title, impact });

  let page;
  try {
    page = await fetchText(inputUrl);
  } catch (err) {
    return {
      finalUrl: inputUrl,
      reachable: false,
      error: String(err.message || err),
      findings: [
        {
          id: 'unreachable',
          level: 'high',
          title: 'The website did not load during our test',
          impact: 'If it is down or blocking visitors, every lead that tries it is lost.',
        },
      ],
      facts: {},
    };
  }

  const finalUrl = page.finalUrl || inputUrl;
  const $ = cheerio.load(page.html);
  const facts = { status: page.status, platform: 'unknown' };

  // --- HTTPS -------------------------------------------------------------
  if (!finalUrl.startsWith('https://')) {
    add('high', 'https', 'The site is not served over HTTPS',
      'Browsers label it "Not secure", which scares off visitors and hurts Google rankings.');
  } else {
    try {
      const host = new URL(finalUrl).host;
      const insecure = await fetchText('http://' + host, 10000);
      if (!insecure.finalUrl.startsWith('https://')) {
        add('medium', 'https_redirect', 'The plain http:// address does not redirect to https://',
          'Some visitors land on an insecure version of the site.');
      } else {
        add('good', 'https', 'Secure (HTTPS) connection', 'Visitors see the padlock and trust the site.');
      }
    } catch {
      add('good', 'https', 'Secure (HTTPS) connection', 'Visitors see the padlock and trust the site.');
    }
  }

  // --- Structured data before we strip scripts ---------------------------
  let jsonLd = '';
  $('script[type="application/ld+json"]').each((_, el) => { jsonLd += $(el).text(); });
  const hasLocalSchema = LOCAL_TYPES.some((t) => jsonLd.includes(`"${t}"`));

  // --- Platform hint -----------------------------------------------------
  const rawLower = page.html.toLowerCase();
  const generator = ($('meta[name="generator"]').attr('content') || '').toLowerCase();
  if (rawLower.includes('wp-content') || generator.includes('wordpress')) facts.platform = 'WordPress';
  else if (rawLower.includes('wixstatic') || generator.includes('wix')) facts.platform = 'Wix';
  else if (rawLower.includes('squarespace')) facts.platform = 'Squarespace';
  else if (rawLower.includes('cdn.shopify')) facts.platform = 'Shopify';
  else if (rawLower.includes('godaddy') || rawLower.includes('websitebuilder')) facts.platform = 'GoDaddy builder';
  else if (rawLower.includes('weebly')) facts.platform = 'Weebly';

  // --- Basic SEO tags ----------------------------------------------------
  const title = ($('title').first().text() || '').trim();
  if (!title) {
    add('medium', 'title', 'The page has no title tag', 'The title is the headline people see in Google results.');
  } else if (title.length < 20 || title.length > 65) {
    add('low', 'title', `The page title is ${title.length < 20 ? 'very short' : 'too long'} (${title.length} characters)`,
      'A clear title with the service and town helps people choose your listing.');
  }

  const desc = ($('meta[name="description"]').attr('content') || '').trim();
  if (!desc) {
    add('medium', 'meta_description', 'No meta description',
      'Google shows a random snippet instead of a message you control.');
  }

  if (!$('meta[name="viewport"]').length) {
    add('high', 'viewport', 'The site is not set up for mobile screens',
      'Most local searches happen on phones; the page will look tiny and be hard to use.');
  }

  const h1 = $('h1').length;
  if (h1 === 0) {
    add('medium', 'h1', 'No main headline (H1) on the page',
      'Search engines and visitors use the main headline to understand what you do.');
  }

  // --- Lead capture ------------------------------------------------------
  const telLinks = $('a[href^="tel:"]').length;
  const bodyClone = cheerio.load(page.html);
  bodyClone('script,style,noscript,svg').remove();
  const text = bodyClone('body').text().replace(/\s+/g, ' ').trim();
  const phoneVisible = PHONE_RE.test(text);
  facts.words = text ? text.split(' ').length : 0;
  facts.phoneVisible = phoneVisible;
  facts.telLinks = telLinks;

  if (telLinks === 0) {
    add('high', 'click_to_call',
      phoneVisible ? 'The phone number is not tap-to-call on mobile' : 'No phone number or call button found',
      'On a phone, one tap should start the call. Every extra step loses jobs.');
  } else {
    add('good', 'click_to_call', 'Tap-to-call phone link is in place', 'Mobile visitors can call in one tap.');
  }

  const forms = $('form').filter((_, f) => $(f).find('input,textarea,select').length > 1).length;
  facts.forms = forms;
  if (forms === 0) {
    add('medium', 'contact_form', 'No contact or quote-request form found',
      'Visitors who do not want to call right now have no way to reach you.');
  } else {
    add('good', 'contact_form', 'A contact form is available', 'Visitors can reach you without calling.');
  }

  const ctaCount = $('a,button,input[type="submit"]').filter((_, el) => CTA_RE.test($(el).text() + ' ' + ($(el).attr('value') || ''))).length;
  facts.ctas = ctaCount;
  if (ctaCount === 0) {
    add('medium', 'cta', 'No clear "Get a quote" or "Book now" button',
      'Visitors need an obvious next step; without one most simply leave.');
  }

  // --- Trust and local signals ------------------------------------------
  if (!PROOF_RE.test(text)) {
    add('medium', 'social_proof', 'No reviews or testimonials visible',
      'Reviews are the main way local customers decide who to trust.');
  } else {
    add('good', 'social_proof', 'Reviews or testimonials are shown', 'Social proof builds trust quickly.');
  }

  const localRe = new RegExp(`\\b(PA|Pennsylvania|Chester County|${city ? city.replace(/[^\w ]/g, '') : 'Exton'})\\b`, 'i');
  if (!localRe.test(text)) {
    add('medium', 'local_mention', 'The site never mentions the town or area served',
      'Google needs to see where you work to show you for "near me" searches.');
  }

  if (!hasLocalSchema) {
    add('low', 'schema', 'No local business data for Google (structured data)',
      'It helps Google show your hours, phone and area directly in results.');
  }

  const hasMap = $('iframe[src*="google.com/maps"], iframe[src*="maps.google"], a[href*="google.com/maps"], a[href*="goo.gl/maps"]').length > 0;
  if (!hasMap) {
    add('low', 'map', 'No map or directions link', 'Customers expect to see where you are or what area you cover.');
  }

  // --- Quality details ---------------------------------------------------
  const imgs = $('img');
  const noAlt = imgs.filter((_, i) => !($(i).attr('alt') || '').trim()).length;
  if (imgs.length >= 4 && noAlt / imgs.length > 0.3) {
    add('low', 'alt', `${noAlt} of ${imgs.length} images have no description (alt text)`,
      'Hurts accessibility and image search visibility.');
  }

  if (!$('meta[property="og:image"]').length || !$('meta[property="og:title"]').length) {
    add('low', 'og', 'Links shared on Facebook or text messages look plain',
      'A preview image and title make shared links much more clickable.');
  }

  const years = [...text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const thisYear = new Date().getFullYear();
  if (years.length && Math.max(...years) < thisYear - 1) {
    add('low', 'stale', `The footer still says ${Math.max(...years)}`,
      'An old copyright year makes visitors wonder if the business is still active.');
  }

  if (facts.words < 250) {
    add('low', 'thin', 'Very little text on the page',
      'Search engines have little to work with, and visitors get few reasons to call.');
  }

  return { finalUrl, reachable: true, findings, facts };
}
