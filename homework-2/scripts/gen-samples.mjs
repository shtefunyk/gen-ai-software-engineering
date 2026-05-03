import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'demo');
mkdirSync(out, { recursive: true });
mkdirSync(resolve(out, 'invalid'), { recursive: true });

const SUBJECTS = [
  ['Cannot login', 'I cannot sign in for two days'],
  ['Charged twice', 'Production down — please refund the duplicate billing'],
  ['App crashes', 'The mobile app crashes on the dashboard screen'],
  ['Feature suggestion', 'Please add dark mode'],
  ['Bug: typo on settings', 'Minor cosmetic issue on the settings page'],
  ['Account suspended', 'My account is suspended without warning — security'],
];
const SOURCES = ['web_form', 'email', 'api', 'chat', 'phone'];
const DEVICES = ['desktop', 'mobile', 'tablet'];

function row(i) {
  const s = SUBJECTS[i % SUBJECTS.length];
  return {
    customer_id: `C-${String(i).padStart(4, '0')}`,
    customer_email: `user${i}@example.com`,
    customer_name: `Customer ${i}`,
    subject: s[0],
    description: s[1] + ` (case ${i})`,
    metadata: {
      source: SOURCES[i % SOURCES.length],
      browser: 'Mozilla/5.0',
      device_type: DEVICES[i % DEVICES.length],
    },
  };
}

function csv(n) {
  const header = 'customer_id,customer_email,customer_name,subject,description,metadata.source,metadata.browser,metadata.device_type';
  const lines = [header];
  for (let i = 1; i <= n; i++) {
    const r = row(i);
    lines.push(
      [r.customer_id, r.customer_email, r.customer_name, JSON.stringify(r.subject), JSON.stringify(r.description), r.metadata.source, r.metadata.browser, r.metadata.device_type].join(',')
    );
  }
  return lines.join('\n') + '\n';
}

function json(n) {
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(row(i));
  return JSON.stringify(arr, null, 2);
}

function xml(n) {
  const items = [];
  for (let i = 1; i <= n; i++) {
    const r = row(i);
    items.push(
      `  <ticket>
    <customer_id>${r.customer_id}</customer_id>
    <customer_email>${r.customer_email}</customer_email>
    <customer_name>${r.customer_name}</customer_name>
    <subject>${r.subject}</subject>
    <description>${r.description}</description>
    <metadata>
      <source>${r.metadata.source}</source>
      <browser>${r.metadata.browser}</browser>
      <device_type>${r.metadata.device_type}</device_type>
    </metadata>
  </ticket>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tickets>\n${items.join('\n')}\n</tickets>\n`;
}

writeFileSync(resolve(out, 'sample_tickets.csv'), csv(50));
writeFileSync(resolve(out, 'sample_tickets.json'), json(20));
writeFileSync(resolve(out, 'sample_tickets.xml'), xml(30));
writeFileSync(
  resolve(out, 'invalid', 'broken-csv.csv'),
  'customer_id,customer_email,"customer_name\nC-1,a@b.co,Ada\n'
);
writeFileSync(resolve(out, 'invalid', 'broken-json.json'), '{not json');
writeFileSync(resolve(out, 'invalid', 'broken-xml.xml'), '<tickets><ticket></tickets>');

console.log('Generated samples in', out);
