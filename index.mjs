import fs from 'node:fs';
import tls from 'node:tls';

const domain = (process.env.INPUT_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
const minSslDays = Number.parseInt(process.env.INPUT_MIN_SSL_DAYS || '14', 10) || 14;
const requireList = (process.env.INPUT_REQUIRE || 'A,MX')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
const apiKey = (process.env.INPUT_API_KEY || '').trim();
const unknownMode = (process.env.INPUT_UNKNOWN || 'fail').trim().toLowerCase();

if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
  console.error(`Invalid domain input: "${domain}"`);
  process.exit(1);
}

const reportUrl = `https://thenetworktools.com/report/${encodeURIComponent(domain)}`;
const badgeUrl = `https://thenetworktools.com/badge/${encodeURIComponent(domain)}.svg`;

function setOutput(name, value) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) fs.appendFileSync(outFile, `${name}=${value}\n`);
}

function appendSummary(md) {
  const sumFile = process.env.GITHUB_STEP_SUMMARY;
  if (sumFile) fs.appendFileSync(sumFile, `${md}\n`);
}

async function queryDoh(name, type) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
    headers: { Accept: 'application/dns-json' }
  });
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.Answer) ? data.Answer.map((a) => String(a.data || '').replace(/^"|"$/g, '')) : [];
}

function checkTls(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      socket.end();
      if (!cert?.valid_to) return reject(new Error('No peer TLS certificate'));
      const daysRemaining = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
      resolve({ authorized, daysRemaining, validTo: cert.valid_to });
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TLS connection timeout'));
    });
    socket.on('error', reject);
  });
}

async function main() {
  setOutput('report_url', reportUrl);
  setOutput('badge_url', badgeUrl);

  if (apiKey) {
    const qs = new URLSearchParams({
      domain,
      min_ssl_days: String(minSslDays),
      require: requireList.join(','),
      unknown: unknownMode
    });
    const res = await fetch(`https://thenetworktools.com/api/v1/ci?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const body = await res.json().catch(() => ({}));
    const passed = res.status === 200 && Boolean(body?.pass);
    setOutput('passed', String(passed));
    appendSummary(`### The Network Tools CI Gate (\`${domain}\`)\n\n[![Status](${badgeUrl})](${reportUrl})\n\n- **Status:** ${passed ? 'PASS' : 'FAIL'}\n- **Full Report:** ${reportUrl}`);
    console.log(JSON.stringify(body, null, 2));
    process.exit(passed ? 0 : 1);
  }

  const failures = [];
  const summaryRows = [];

  try {
    const ssl = await checkTls(domain);
    const sslOk = ssl.authorized && ssl.daysRemaining >= minSslDays;
    summaryRows.push(`| TLS / SSL | ${sslOk ? 'PASS' : 'FAIL'} | ${ssl.daysRemaining} days remaining (min ${minSslDays}) |`);
    if (!sslOk) failures.push(`SSL invalid or expiring in ${ssl.daysRemaining}d (< ${minSslDays}d)`);
  } catch (err) {
    summaryRows.push(`| TLS / SSL | FAIL | ${err.message} |`);
    failures.push(`TLS check failed: ${err.message}`);
  }

  for (const check of requireList) {
    if (check === 'A' || check === 'AAAA' || check === 'MX') {
      const records = await queryDoh(domain, check);
      const ok = records.length > 0;
      summaryRows.push(`| DNS ${check} | ${ok ? 'PASS' : 'FAIL'} | ${records.length} record(s) |`);
      if (!ok) failures.push(`Missing required ${check} record`);
    } else if (check === 'SPF') {
      const txt = await queryDoh(domain, 'TXT');
      const ok = txt.some((r) => /^v=spf1\b/i.test(r));
      summaryRows.push(`| SPF | ${ok ? 'PASS' : 'FAIL'} | ${ok ? 'Found v=spf1' : 'Missing v=spf1'} |`);
      if (!ok) failures.push('Missing SPF (v=spf1) TXT record');
    } else if (check === 'DMARC') {
      const txt = await queryDoh(`_dmarc.${domain}`, 'TXT');
      const ok = txt.some((r) => /^v=DMARC1\b/i.test(r));
      summaryRows.push(`| DMARC | ${ok ? 'PASS' : 'FAIL'} | ${ok ? 'Found v=DMARC1' : 'Missing _dmarc TXT'} |`);
      if (!ok) failures.push('Missing _dmarc DMARC1 TXT record');
    }
  }

  const passed = failures.length === 0;
  setOutput('passed', String(passed));
  appendSummary(
    `### The Network Tools CI Check (\`${domain}\`)\n\n[![Status](${badgeUrl})](${reportUrl})\n\n| Check | Result | Details |\n| :--- | :--- | :--- |\n${summaryRows.join('\n')}\n\n- **Full Interactive Audit:** ${reportUrl}`
  );

  console.log(`Domain: ${domain}\nPassed: ${passed}\nReport: ${reportUrl}`);
  if (!passed) {
    console.error('Failures:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
