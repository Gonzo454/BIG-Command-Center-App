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

// Try to extract a line-item amount that is distinct from the check total.
// AppFolio may use any of these field names depending on report version.
function getLineAmount(t) {
  const candidates = [t.detail_amount, t.amount, t.line_amount, t.gl_amount, t.debit];
  for (const v of candidates) {
    if (v !== undefined && v !== null && v !== '') {
      const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : parseFloat(v);
      if (!isNaN(n) && n !== 0) return n;
    }
  }
  return null;
}

// Build a grouping key for transactions that belong to the same check/payment.
// Priority: check_id > check_number > composite key (vendor+date+amount).
function getCheckKey(t, idx) {
  if (t.check_id != null && t.check_id !== '') return `id_${t.check_id}`;
  if (t.check_number != null && t.check_number !== '') return `num_${t.payee_name || ''}|${t.check_number}`;
  // Composite fallback: group by vendor + date + payment_amount
  // This catches multi-GL rows that share the same check but lack an explicit ID.
  if (t.payment_amount && t.payee_name) return `comp_${t.payee_name}|${t.occurred_date || ''}|${t.payment_amount}`;
  return `_standalone_${idx}`;
}

function analyzeTransactions(txns) {
  if (txns.length === 0) {
    return { totalDisbursed: 0, topProperties: [], topVendors: [], topVendorDetails: [], flags: [] };
  }

  // --- Diagnostic logging ---
  const sample = txns[0];
  const allFields = Object.keys(sample);
  console.log('=== DIAGNOSTIC ===');
  console.log('Total rows from API:', txns.length);
  console.log('Fields available:', allFields.join(', '));
  console.log('Sample row:', JSON.stringify(sample, null, 2));
  // Log a few rows from a multi-line vendor if present
  const vendorCounts = {};
  txns.forEach(t => {
    const v = t.payee_name || 'Unknown';
    vendorCounts[v] = (vendorCounts[v] || 0) + 1;
  });
  const multiLineVendor = Object.entries(vendorCounts).find(([, c]) => c > 3);
  if (multiLineVendor) {
    const rows = txns.filter(t => t.payee_name === multiLineVendor[0]).slice(0, 3);
    console.log(`Sample rows for "${multiLineVendor[0]}" (${multiLineVendor[1]} total):`);
    rows.forEach((r, i) => console.log(`  Row ${i}:`, JSON.stringify(r)));
  }
  console.log('=== END DIAGNOSTIC ===');

  // Group rows by check key
  const checkGroups = new Map();
  txns.forEach((t, idx) => {
    const key = getCheckKey(t, idx);
    if (!checkGroups.has(key)) checkGroups.set(key, []);
    checkGroups.get(key).push(t);
  });
  console.log(`${txns.length} rows → ${checkGroups.size} unique checks/payments`);

  const byProperty = {};
  const byVendor = {};
  const vendorDetail = {};
  const flags = [];
  const seenFlags = new Set();
  let totalDisbursed = 0;

  for (const [checkKey, lines] of checkGroups) {
    const first = lines[0];
    const checkAmt = parseFloat(String(first.payment_amount || '0').replace(/,/g, '')) || getLineAmount(first) || 0;
    const vendor = first.payee_name || 'Unknown';
    const date = first.occurred_date || '';

    // --- Per-check line-amount detection ---
    // Check if THIS check group has real line-item amounts (distinct from check total).
    const lineAmts = lines.map(l => getLineAmount(l));
    const hasRealLineAmts = lines.length > 1 && lineAmts.some(a => a !== null && Math.abs(a - checkAmt) > 0.01);

    // Total disbursed — each check counted once
    totalDisbursed += checkAmt;

    // Vendor total — each check counted once
    byVendor[vendor] = (byVendor[vendor] || 0) + checkAmt;

    if (!vendorDetail[vendor]) vendorDetail[vendor] = {};

    if (hasRealLineAmts) {
      // This check has real per-line amounts — show individual GL breakdown
      lines.forEach((t, i) => {
        const lineAmt = lineAmts[i] || checkAmt;
        const prop = t.property_name || 'Unknown';
        const gl = t.gl_account_name || 'Uncategorized';
        const remarks = t.remarks || '';

        byProperty[prop] = (byProperty[prop] || 0) + lineAmt;

        if (!vendorDetail[vendor][gl]) vendorDetail[vendor][gl] = { total: 0, properties: {} };
        vendorDetail[vendor][gl].total += lineAmt;
        vendorDetail[vendor][gl].properties[prop] = (vendorDetail[vendor][gl].properties[prop] || 0) + lineAmt;

        addLineFlags(flags, seenFlags, lineAmt, prop, vendor, gl, date, remarks);
      });
    } else {
      // No real line amounts for this check — consolidate to one entry.
      // Distribute property spend evenly across unique properties.
      const props = [...new Set(lines.map(l => l.property_name || 'Unknown'))];
      const perProp = checkAmt / props.length;
      props.forEach(p => { byProperty[p] = (byProperty[p] || 0) + perProp; });

      // Vendor detail: one consolidated entry per check
      const glAccounts = [...new Set(lines.map(l => l.gl_account_name || 'Uncategorized'))];
      const gl = glAccounts.length === 1 ? glAccounts[0] : `${glAccounts[0]} + ${glAccounts.length - 1} more`;
      if (!vendorDetail[vendor][gl]) vendorDetail[vendor][gl] = { total: 0, properties: {} };
      vendorDetail[vendor][gl].total += checkAmt;
      props.forEach(p => {
        vendorDetail[vendor][gl].properties[p] = (vendorDetail[vendor][gl].properties[p] || 0) + perProp;
      });

      // Flags from check level
      const firstGl = first.gl_account_name || '';
      const prop = first.property_name || 'Unknown';
      const remarks = first.remarks || '';
      addLineFlags(flags, seenFlags, checkAmt, prop, vendor, firstGl, date, remarks);
    }

    // CC statement flag — always at check level, deduped
    if (vendor.toLowerCase().includes('visa') || vendor.toLowerCase().includes('credit card')) {
      const flagKey = checkKey.startsWith('_standalone_') ? `${vendor}|${date}|${checkAmt}` : checkKey;
      if (!seenFlags.has(`cc_${flagKey}`)) {
        seenFlags.add(`cc_${flagKey}`);
        flags.push({ type: 'review', label: `CC statement payment: ${fmtFull(checkAmt)}`, detail: `${(first.property_name || 'Unknown')} — line items need detail review`, date });
      }
    }
  }

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

function addLineFlags(flags, seen, amt, prop, vendor, gl, date, remarks) {
  if (vendor.includes('Baker Tilly') && amt > 2000) {
    const key = `bt_${prop}_${amt}_${date}`;
    if (!seen.has(key)) { seen.add(key); flags.push({ type: 'review', label: `Baker Tilly: ${fmtFull(amt)}`, detail: `${prop} — ${remarks || gl}`, date }); }
  }
  if (gl.toLowerCase().includes('legal') && amt > 1000) {
    const key = `legal_${vendor}_${prop}_${amt}_${date}`;
    if (!seen.has(key)) { seen.add(key); flags.push({ type: 'review', label: `Legal: ${vendor} ${fmtFull(amt)}`, detail: `${prop} — ${remarks || gl}`, date }); }
  }
  if (gl.toLowerCase().includes('franchise') && amt > 5000) {
    const key = `franchise_${prop}_${amt}_${date}`;
    if (!seen.has(key)) { seen.add(key); flags.push({ type: 'info', label: `Franchise fee: ${fmtFull(amt)}`, detail: `${prop} — ${vendor}`, date }); }
  }
  if ((gl.toLowerCase().includes('electricity') || gl.toLowerCase().includes('gas')) && amt > 10000) {
    const key = `util_${vendor}_${prop}_${amt}_${date}`;
    if (!seen.has(key)) { seen.add(key); flags.push({ type: 'review', label: `Large utility: ${vendor} ${fmtFull(amt)}`, detail: `${prop} — verify vs prior month`, date }); }
  }
  if (gl.toLowerCase().includes('tenant improvements') && amt > 5000) {
    const key = `capex_${vendor}_${prop}_${amt}_${date}`;
    if (!seen.has(key)) { seen.add(key); flags.push({ type: 'info', label: `Capital spend: ${vendor} ${fmtFull(amt)}`, detail: `${prop} — ${remarks || gl}`, date }); }
  }
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
