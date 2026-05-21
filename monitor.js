require('dotenv').config();
const nodemailer = require('nodemailer');

const {
  APPFOLIO_CLIENT_ID,
  APPFOLIO_CLIENT_SECRET,
  APPFOLIO_DATABASE,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  REPORT_EMAIL,
} = process.env;

function today() {
  return new Date().toISOString().split('T')[0];
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

async function fetchReport(reportName, body = {}) {
  const credentials = Buffer.from(`${APPFOLIO_CLIENT_ID}:${APPFOLIO_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`https://${APPFOLIO_DATABASE}.appfolio.com/api/v2/reports/${reportName}.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio API error ${res.status} on ${reportName}: ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || []);
}

async function getCheckRegister() {
  return fetchReport('check_register_detail', {
    from_date: firstOfMonth(),
    to_date: today(),
  });
}

function analyzeTransactions(txns) {
  const byProperty = {};
  const byVendor = {};
  const vendorDetail = {};
  const flags = [];
  const seenChecks = new Set();
  const disbursedChecks = new Set();
  let totalDisbursed = 0;

  if (txns.length > 0) {
    const sample = txns[0];
    console.log('Sample transaction fields:', Object.keys(sample).join(', '));
    console.log('Sample values — amount:', sample.amount, 'payment_amount:', sample.payment_amount, 'check_id:', sample.check_id);
  }

  txns.forEach(t => {
    const lineAmt = parseFloat(t.amount || t.payment_amount || 0);
    const checkAmt = parseFloat(t.payment_amount || t.amount || 0);
    const checkId = t.check_id || '';
    const prop = t.property_name || 'Unknown';
    const vendor = t.payee_name || 'Unknown';
    const gl = t.gl_account_name || 'Uncategorized';
    const date = t.occurred_date || '';
    const remarks = t.remarks || '';

    if (checkId && !disbursedChecks.has(checkId)) {
      disbursedChecks.add(checkId);
      totalDisbursed += checkAmt;
    } else if (!checkId) {
      totalDisbursed += lineAmt;
    }

    byProperty[prop] = (byProperty[prop] || 0) + lineAmt;
    byVendor[vendor] = (byVendor[vendor] || 0) + lineAmt;

    if (!vendorDetail[vendor]) vendorDetail[vendor] = {};
    if (!vendorDetail[vendor][gl]) vendorDetail[vendor][gl] = { total: 0, properties: {} };
    vendorDetail[vendor][gl].total += lineAmt;
    vendorDetail[vendor][gl].properties[prop] = (vendorDetail[vendor][gl].properties[prop] || 0) + lineAmt;

    if (vendor.includes('Baker Tilly') && lineAmt > 2000)
      flags.push({ type: 'review', label: `Baker Tilly: ${fmtFull(lineAmt)}`, detail: `${prop} — ${remarks || gl}`, date });
    if (gl.toLowerCase().includes('legal') && lineAmt > 1000)
      flags.push({ type: 'review', label: `Legal: ${vendor} ${fmtFull(lineAmt)}`, detail: `${prop} — ${remarks || gl}`, date });
    if (gl.toLowerCase().includes('franchise') && lineAmt > 5000)
      flags.push({ type: 'info', label: `Franchise fee: ${fmtFull(lineAmt)}`, detail: `${prop} — ${vendor}`, date });
    if ((gl.toLowerCase().includes('electricity') || gl.toLowerCase().includes('gas')) && lineAmt > 10000)
      flags.push({ type: 'review', label: `Large utility: ${vendor} ${fmtFull(lineAmt)}`, detail: `${prop} — verify vs prior month`, date });
    if (gl.toLowerCase().includes('tenant improvements') && lineAmt > 5000)
      flags.push({ type: 'info', label: `Capital spend: ${vendor} ${fmtFull(lineAmt)}`, detail: `${prop} — ${remarks || gl}`, date });
    if (vendor.toLowerCase().includes('visa') || vendor.toLowerCase().includes('credit card')) {
      const dedupKey = checkId || `${vendor}|${date}|${checkAmt}`;
      if (!seenChecks.has(dedupKey)) {
        seenChecks.add(dedupKey);
        flags.push({ type: 'review', label: `CC statement payment: ${fmtFull(checkAmt)}`, detail: `${prop} — line items need detail review`, date });
      }
    }
  });

  const topProperties = Object.entries(byProperty).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topVendors = Object.entries(byVendor).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const topVendorDetails = topVendors.map(([name]) => {
    const detail = vendorDetail[name] || {};
    const glBreakdown = Object.entries(detail)
      .map(([gl, data]) => ({ gl, total: data.total, properties: data.properties }))
      .sort((a, b) => b.total - a.total);
    return { name, breakdown: glBreakdown };
  });

  return { totalDisbursed, topProperties, topVendors, topVendorDetails, flags };
}

function buildEmail(txns, reportDate) {
  const { totalDisbursed, topProperties, topVendors, topVendorDetails, flags } = analyzeTransactions(txns);

  const propRows = topProperties.map(([name, amt]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${name}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(amt)}</td>
    </tr>`).join('');

  const vendorRows = topVendors.map(([name, amt]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${name}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(amt)}</td>
    </tr>`).join('');

  const flagRows = flags.map(f => `
    <tr>
      <td style="padding:8px 12px 8px 0;vertical-align:top;">
        <span style="display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:500;
          background:${f.type === 'review' ? '#FEF3C7' : '#DBEAFE'};
          color:${f.type === 'review' ? '#92400E' : '#1E40AF'};">${f.type === 'review' ? 'review' : 'note'}</span>
      </td>
      <td style="padding:8px 0;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">
        <strong>${f.label}</strong><br>
        <span style="color:#6B7280;font-size:12px;">${f.detail} · ${f.date}</span>
      </td>
    </tr>`).join('');

  const vendorDetailRows = topVendorDetails.map(v => {
    const glRows = v.breakdown.map(b => {
      const propList = Object.entries(b.properties)
        .sort((a, b) => b[1] - a[1])
        .map(([p, a]) => `${p}: ${fmtFull(a)}`)
        .join(', ');
      return `
      <tr>
        <td style="padding:4px 12px 4px 16px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6;">${b.gl}</td>
        <td style="padding:4px 8px;font-size:12px;color:#6B7280;border-bottom:1px solid #f3f4f6;">${propList}</td>
        <td style="padding:4px 0;font-size:12px;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${fmtFull(b.total)}</td>
      </tr>`;
    }).join('');
    return `
  <tr><td style="padding:20px 28px 0;">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111827;">${v.name} <span style="font-weight:400;color:#6B7280;">— breakdown by GL account</span></h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:4px 12px 4px 16px;font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #E5E7EB;">GL Account</td>
        <td style="padding:4px 8px;font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #E5E7EB;">Properties</td>
        <td style="padding:4px 0;font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.04em;text-align:right;border-bottom:1px solid #E5E7EB;">Amount</td>
      </tr>
      ${glRows}
    </table>
  </td></tr>`;
  }).join('');

  const [year, month, day] = reportDate.split('-');
  const monthName = new Date(year, month - 1, day).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #E5E7EB;">
  <tr><td style="background:#111827;padding:24px 28px;border-radius:8px 8px 0 0;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;letter-spacing:0.08em;text-transform:uppercase;">Confidential · Metify</p>
    <h1 style="margin:4px 0 0;font-size:20px;color:#fff;font-weight:500;">BIG Financial Monitor</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#9CA3AF;">${monthName} · as of ${reportDate}</p>
  </td></tr>
  <tr><td style="padding:20px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="width:50%;padding-right:8px;">
        <div style="background:#F3F4F6;border-radius:6px;padding:14px 16px;">
          <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Total disbursed MTD</p>
          <p style="margin:4px 0 0;font-size:24px;font-weight:500;color:#111827;">${fmt(totalDisbursed)}</p>
        </div>
      </td>
      <td style="width:50%;padding-left:8px;">
        <div style="background:#F3F4F6;border-radius:6px;padding:14px 16px;">
          <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Transactions</p>
          <p style="margin:4px 0 0;font-size:24px;font-weight:500;color:#111827;">${txns.length}</p>
        </div>
      </td>
    </tr></table>
  </td></tr>
  ${flags.length > 0 ? `<tr><td style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:500;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Items to review</h2>
    <table width="100%" cellpadding="0" cellspacing="0">${flagRows}</table>
  </td></tr>` : ''}
  <tr><td style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:500;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Top 10 properties by spend</h2>
    <table width="100%" cellpadding="0" cellspacing="0">${propRows}</table>
  </td></tr>
  <tr><td style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:500;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Top 10 vendors by spend</h2>
    <table width="100%" cellpadding="0" cellspacing="0">${vendorRows}</table>
  </td></tr>
  ${vendorDetailRows}
  <tr><td style="height:16px;"></td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 28px;border-radius:0 0 8px 8px;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;">Generated by Metify · blackdeerig.appfolio.com · Confidential — do not forward</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendEmail(html, reportDate) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"Metify Monitor" <${SMTP_USER}>`,
    to: REPORT_EMAIL,
    subject: `BIG Financial Monitor — ${reportDate}`,
    html,
  });

  console.log(`Email sent to ${REPORT_EMAIL}`);
}

async function run() {
  const reportDate = today();
  console.log(`[${new Date().toISOString()}] Running BIG monitor for ${reportDate}...`);
  try {
    const txns = await getCheckRegister();
    console.log(`Fetched ${txns.length} transactions`);
    const html = buildEmail(txns, reportDate);
    await sendEmail(html, reportDate);
    console.log('Done.');
  } catch (err) {
    console.error('Monitor failed:', err.message);
    process.exit(1);
  }
}

run();
