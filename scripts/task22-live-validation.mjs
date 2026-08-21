// TASK 22 live production validation (run: node scripts/task22-live-validation.mjs)
const BASE = 'https://www.aivaultsai.one';
const PAGES = ['/', '/websites', '/ai-assistenten', '/leadautomatisering', '/sitemap.xml', '/robots.txt'];

for (const p of PAGES) {
  try {
    const res = await fetch(BASE + p, { redirect: 'follow', headers: { 'user-agent': 'aivaultsai-live-validation' } });
    const text = await res.text();
    const isHtml = text.includes('<!DOCTYPE html>') || text.includes('<html');
    let line = p + ' -> status=' + res.status + ' | bytes=' + text.length;
    if (isHtml) {
      const title = /<title[^>]*>([^<]+)<\/title>/.exec(text);
      const canonical = /<link[^>]+rel="canonical"[^>]*>/i.test(text);
      const og = /<meta[^>]+property="og:title"[^>]*>/i.test(text);
      const ld = (text.match(/application\/ld\+json/g) || []).length;
      line += ' | title=' + (title ? title[1].trim().slice(0, 50) : 'MISSING');
      line += ' | canonical=' + (canonical ? 'present' : 'MISSING');
      line += ' | og:title=' + (og ? 'present' : 'MISSING');
      line += ' | jsonld=' + ld;
    } else {
      line += p.includes('sitemap') ? ' | locs=' + ((text.match(/<loc>/g) || []).length) : ' | sitemap=' + (text.includes('Sitemap:') ? 'listed' : 'missing');
    }
    console.log(line);
  } catch (e) {
    console.log(p + ' -> ERROR ' + e.message);
  }
}

// Assistant POST regression (safe, attribution included, no PII)
console.log('--- assistant POST ---');
const sessionId = crypto.randomUUID();
try {
  const res = await fetch(BASE + '/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'aivaultsai-live-validation' },
    body: JSON.stringify({
      message: 'Hallo, ik wil graag meer weten over de leasdienst voor websites.',
      sessionId,
      attribution: {
        referrer: 'https://www.bing.com/search?q=aivaultsai',
        landing_page: 'https://www.aivaultsai.one/websites',
        utm_source: 'bing',
        utm_medium: 'organic',
        utm_campaign: 'q1',
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  console.log('status=' + res.status);
  console.log('conversationId=' + (json.conversationId || 'MISSING'));
  console.log('message=' + (typeof json.message === 'string' ? json.message.slice(0, 70) : JSON.stringify(json).slice(0, 120)));
} catch (e) {
  console.log('POST ERROR ' + e.message);
}

// Booking: availability must be available:false (no invented slots)
console.log('--- booking availability ---');
try {
  const res = await fetch(BASE + '/api/booking/availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'aivaultsai-live-validation' },
    body: JSON.stringify({
      startDate: '2026-09-01T09:00:00Z',
      endDate: '2026-09-01T17:00:00Z',
      timezone: 'Europe/Amsterdam',
      durationMinutes: 30,
    }),
  });
  const json = await res.json().catch(() => ({}));
  console.log('status=' + res.status + ' | ok=' + json.ok + ' | available=' + json.available + ' | slots=' + (json.slots ? json.slots.length : 'n/a'));
} catch (e) {
  console.log('availability ERROR ' + e.message);
}

// Booking: appointments must 503 (never a fake confirmation)
console.log('--- booking appointments ---');
try {
  const res = await fetch(BASE + '/api/booking/appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'aivaultsai-live-validation' },
    body: JSON.stringify({
      leadId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      start: '2026-09-01T10:00:00Z',
      end: '2026-09-01T10:30:00Z',
      timezone: 'Europe/Amsterdam',
      contactMethod: 'video',
    }),
  });
  const json = await res.json().catch(() => ({}));
  console.log('status=' + res.status + ' | ok=' + json.ok + ' | available=' + json.available + ' | error=' + (json.error || 'n/a').slice(0, 90));
} catch (e) {
  console.log('appointments ERROR ' + e.message);
}
