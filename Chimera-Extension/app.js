document.addEventListener('DOMContentLoaded', () => {
  const modeUrlBtn     = document.getElementById('mode-url');
  const modeEmailBtn   = document.getElementById('mode-email');
  const urlContainer   = document.getElementById('url-input-container');
  const emailContainer = document.getElementById('email-input-container');
  const scanBtn        = document.getElementById('scan-btn');
  const sandboxBtn     = document.getElementById('sandbox-btn');
  const resultContainer= document.getElementById('result-container');
  const scoreValue     = document.getElementById('score-value');
  const verdictText    = document.getElementById('verdict-text');
  const engineBadge    = document.getElementById('engine-badge');
  const sandboxDetail  = document.getElementById('sandbox-detail');

  let currentMode = 'url';
  // Points directly to your production space deployment
  const BASE = 'https://atharvawarade9807-atharva-chimera.hf.space';

  // ── Mode toggles ─────────────────────────────────────────────────────────────
  modeUrlBtn.addEventListener('click', () => {
    currentMode = 'url';
    modeUrlBtn.classList.add('active');
    modeEmailBtn.classList.remove('active');
    urlContainer.classList.remove('hidden');
    emailContainer.classList.add('hidden');
    sandboxBtn.classList.remove('hidden');
    resultContainer.classList.add('hidden');
    sandboxDetail.classList.add('hidden');
  });

  modeEmailBtn.addEventListener('click', () => {
    currentMode = 'email';
    modeEmailBtn.classList.add('active');
    modeUrlBtn.classList.remove('active');
    emailContainer.classList.remove('hidden');
    urlContainer.classList.add('hidden');
    sandboxBtn.classList.add('hidden');
    resultContainer.classList.add('hidden');
    sandboxDetail.classList.add('hidden');
  });

  // ── Analyze button ────────────────────────────────────────────────────────────
  scanBtn.addEventListener('click', async () => {
    const urlPayload   = document.getElementById('url-field').value.trim();
    const emailPayload = document.getElementById('email-field').value.trim();

    if (currentMode === 'url'   && !urlPayload)   return alert('Please enter a URL to scan.');
    if (currentMode === 'email' && !emailPayload) return alert('Please provide email text.');

    setBusy(true, 'Analyzing...');

    try {
      if (currentMode === 'url') {
        await runUrlScan(urlPayload);
      } else {
        await runEmailScan(emailPayload);
      }
    } catch (err) {
      console.error('Scan error:', err);
      renderResults(0, err.message || 'Connection Error', 'Fault Diagnostic');
    } finally {
      setBusy(false);
    }
  });

  // ── URL Scan: Unified V1 + V2 + V4 ──────────────────────────────────────────
  async function runUrlScan(url) {
    const res = await fetch(`${BASE}/predict/unified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!res.ok) throw new Error(`Unified endpoint returned ${res.status}`);
    const data = await res.json();

    let score = Math.round((data.composite_score || 0) * 100);
    score = Math.min(100, Math.max(0, score));

    let engineLabel = 'V1 + V2 + V4';
    if (data.details && data.details.cnn_visual_analysis && data.details.cnn_visual_analysis.message.includes('Skipped')) {
      engineLabel = 'V1 + V4 (V2 Offline/Timeout)';
    }

    renderResults(score, verdict(score), engineLabel);
  }

// ── Email Scan: Precisely mapped to Version_3/main.py schema ──────────
async function runEmailScan(emailContent) {
  const endpoint = 'https://chimera-phishing-server-main.hf.space/scan/email';
  const content = emailContent.replace(/\r?\n|\r/g, " ");

  // The server error explicitly demanded 'raw_text'
  const payload = {
    message_id: "msg_extension_client",
    sender_domain: "extension.local",
    display_name: "Extension Scanner Interface",
    raw_text: content // Changed from 'email_body' to 'raw_text'
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("422 Error Detail:", data);
    throw new Error(`Server returned ${res.status}`);
  }

  // Update UI
  renderResults(Math.round(data.risk_score || 0), data.verdict || 'Processed', 'V3 SVM Classifier');
  
  if (data.details) {
    renderTextDetails(data.details);
  }
}
// ── Sandbox button: V6 Playwright ───────────────────────────────
  sandboxBtn.addEventListener('click', async () => {
    const urlPayload = document.getElementById('url-field').value.trim();
    if (!urlPayload) return alert('Please enter a URL to sandbox.');

    setBusy(true, 'Running Sandbox...', true);

    try {
      const res = await fetch(`${BASE}/api/v6/sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlPayload })
      });
      if (!res.ok) throw new Error(`V6 returned ${res.status}`);
      const data = await res.json();

      const vstr = (data.verdict || 'unknown').toLowerCase();
      let score;
      
      if (vstr === 'malicious') {
        score = Math.round((data.confidence || 0.90) * 100);
      } else if (vstr === 'suspicious') {
        score = Math.round((data.confidence || 0.65) * 100);
      } else {
        score = Math.round((1.0 - (data.confidence || 0.95)) * 100);
      }
      score = Math.min(100, Math.max(0, score));

      renderResults(score, verdict(score), 'V6 Sandbox');
      renderSandboxDetail(data);

    } catch (err) {
      console.error('Sandbox error:', err);
      renderResults(0, 'Sandbox Offline', 'V6');
    } finally {
      setBusy(false, null, true);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function verdict(score) {
    if (score >= 75) return 'Malicious Phish Detected';
    if (score >= 40) return 'Suspicious Signal';
    return 'Safe Asset';
  }

  function setBusy(busy, label, isSandbox) {
    scanBtn.disabled    = busy;
    sandboxBtn.disabled = busy;
    if (isSandbox) {
      sandboxBtn.textContent = busy ? label : 'Deep Sandbox Scan';
    } else {
      scanBtn.textContent = busy ? label : 'Analyze Target';
    }
    if (busy) {
      resultContainer.classList.add('hidden');
      sandboxDetail.classList.add('hidden');
    }
  }

  function renderResults(score, verd, engine) {
    scoreValue.textContent  = score;
    verdictText.textContent = verd;
    engineBadge.textContent = engine ? `Engine: ${engine}` : '';
    
    scoreValue.style.color  =
      score >= 70 ? '#D12229' :
      score >= 40 ? '#C66900' : '#1D8A48';
      
    resultContainer.classList.remove('hidden');
  }

  function renderTextDetails(details) {
    let html = `<div class="sandbox-section-title">NLP Engine Breakdown</div>`;
    html += row('Language Run', esc(details.language_analysis || 'N/A'));
    html += row('Link Scan', esc(details.link_analysis || 'N/A'));
    html += row('Sender Audit', esc(details.sender_check || 'N/A'));
    
    sandboxDetail.innerHTML = html;
    sandboxDetail.classList.remove('hidden');
  }

  function renderSandboxDetail(result) {
    const indicators   = result.indicators || [];
    const raw          = result.raw || {};
    const redirects    = raw.redirect_chain || [];
    const forms        = raw.extracted_forms || [];
    const title        = raw.page_title || 'N/A';
    const networkCount = raw.total_network_connections || 0;

    let html = `<div class="sandbox-section-title">Sandbox Report</div>`;
    html += row('Page title',    esc(title));
    html += row('Network calls', networkCount);
    html += row('Redirects',     redirects.length);
    html += row('Forms found',   forms.length);

    if (indicators.length > 0) {
      html += `<div class="sandbox-section-title" style="margin-top:10px;">Indicators</div>`;
      indicators.forEach(ind => {
        const cls = ind.toLowerCase().includes('critical') ? 'critical' : '';
        html += `<div class="sandbox-indicator ${cls}">${esc(ind)}</div>`;
      });
    } else {
      html += `<div class="sandbox-indicator clean">No suspicious indicators detected.</div>`;
    }

    sandboxDetail.innerHTML = html;
    sandboxDetail.classList.remove('hidden');
  }

  function row(label, value) {
    return `<div class="sandbox-row">
      <span class="sandbox-label" style="min-width: 90px; display:inline-block; font-weight:600;">${label}:</span>
      <span class="sandbox-value" style="text-align: right; word-break: break-word; padding-left: 10px;">${value}</span>
    </div>`;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});