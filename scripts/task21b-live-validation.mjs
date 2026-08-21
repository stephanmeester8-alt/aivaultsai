// TASK 21B live production validation (run: node scripts/task21b-live-validation.mjs)
const BASE = 'https://www.aivaultsai.one';
const PAGES = ['/', '/websites', '/ai-assistenten', '/leadautomatisering', '/sitemap.xml', '/robots.txt'];

const grab = (text, re) => {
  const m = text.match(re);
  return m ? m[0].slice(0, 180) : 'NOT FOUND';
};

for (const p of PAGES) {
  try {
    const res = await fetch(BASE + p, { redirect: 'follow', headers: { 'user-agent': 'aivaultsai-live-validation' } });
    const text = await res.text();
    const isHtml = text.includes('<!DOCTYPE html>') || text.includes('<html');
    let line = p + ' -> status=' + res.status + ' | bytes=' + text.length;
    if (isHtml) {
      const title = /<title[^>]*>([^<]+)<\/title>/.exec(text);
      const canonical = /<link[^>]+rel="canonical"[^>]*>/i.exec(text);
      const ogTitle = /<meta[^>]+property="og:title"[^>]*>/i.exec(text);
      const ogDesc = /<meta[^>]+property="og:description"[^>]*>/i.exec(text);
      const ogUrl = /<meta[^>]+property="og:url"[^>]*>/i.exec(text);
      const ogType = /<meta[^>]+property="og:type"[^>]*>/i.exec(text);
      const tw = /<meta[^>]+name="twitter:card"[^>]*>/i.exec(text);
      const ld = (text.match(/application\/ld\+json/g) || []).length;
      line += ' | title=' + (title ? title[1].trim().slice(0, 60) : 'MISSING');
      line += ' | canonical=' + (canonical ? canonical[0].trim().slice(0, 110) : 'MISSING');
      line += ' | og:title=' + (ogTitle ? 'present' : 'MISSING');
      line += ' | og:description=' + (ogDesc ? 'present' : 'MISSING');
      line += ' | og:url=' + (ogUrl ? 'present' : 'MISSING');
      line += ' | og:type=' + (ogType ? 'present' : 'MISSING');
      line += ' | twitter:card=' + (tw ? 'present' : 'MISSING');
      line += ' | jsonld-blocks=' + ld;
      const scripts = (text.match(/<script[^>]+src="[^"]*"[^>]*>/gi) || []).map((s) => s.slice(0, 90));
      line += ' | scripts=' + scripts.length;
    } else {
      line += ' | sitemapUrls=' + ((text.match(/<loc>/g) || []).length);
      line += ' | robots=' + (text.includes('Sitemap:') ? 'sitemap-listed' : 'no-sitemap');
    }
    console.log(line);
  } catch (e) {
    console.log(p + ' -> ERROR ' + e.message);
  }
}

// assistant POST regression: one safe call with fresh sessionId + attribution (no PII)
console.log('--- assistant POST regression ---');
const sessionId = crypto.randomUUID();
const body = {
  message: 'Hallo, ik wil meer weten over de websites dienst.',
  sessionId,
  attribution: {
    referrer: 'https://www.google.com/search?q=aivaultsai',
    landing_page: 'https://www.aivaultsai.one/websites?utm_source=google&utm_medium=organic',
    utm_source: 'google',
    utm_medium: 'organic',
    utm_campaign: 'winter',
  },
};
try {
  const res = await fetch(BASE + '/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'aivaultsai-live-validation' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log('status=' + res.status);
  console.log('conversationId=' + (json.conversationId || 'MISSING'));
  console.log('message=' + (typeof json.message === 'string' ? json.message.slice(0, 80) : JSON.stringify(json).slice(0, 120)));
} catch (e) {
  console.log('POST ERROR ' + e.message);
}
