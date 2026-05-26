const CANVA_API = 'https://api.canva.com/rest/v1';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const CACHE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
const CACHE_DURATION = 31536000;

const PORTFOLIO_PROJECTS = [
  { id: 'ocean-drive', name: 'Ocean Drive Auto Detailing', screenshot: 'screenshots/screencapture-oceandriveauto-netlify-app-2026-05-14-19_06_42.png', tech: ['Next.js', 'Tailwind', 'Stripe'], category: 'Full Stack', description: 'A premium auto detailing booking platform with real-time availability and payment processing.' },
  { id: 'novaforge', name: 'NovaForge Studios', screenshot: 'screenshots/screencapture-novaforgestudios-netlify-app-2026-05-14-19_07_19.png', tech: ['Next.js', 'Framer Motion', 'GSAP'], category: 'Portfolio', description: 'An immersive portfolio site for a creative studio with cutting-edge animations.' },
  { id: 'luna-brew', name: 'Luna Brew Cafe', screenshot: 'screenshots/screencapture-lunabrewcafe-netlify-app-2026-05-14-19_08_20.png', tech: ['Next.js', 'Tailwind', 'Sanity CMS'], category: 'Cafe', description: 'A warm, inviting website for a local coffee shop with menu management and events.' },
  { id: 'marvelous-trifle', name: 'Marvelous Trifle', screenshot: 'screenshots/screencapture-marvelous-trifle-22eebc-netlify-app-2026-05-14-19_05_57.png', tech: ['React', 'Node.js', 'PostgreSQL'], category: 'Full Stack', description: 'A full-stack recipe sharing platform with user accounts and meal planning.' },
  { id: 'the-rabbitry', name: 'The Rabbitry', screenshot: 'screenshots/screencapture-therabbitry-netlify-app-2026-05-14-19_37_32.png', tech: ['HTML', 'CSS', 'JavaScript'], category: 'Landing', description: 'A clean, responsive landing page for a small animal farm business.' },
  { id: 'trinker-drank', name: 'Trinker Drank Winkel', screenshot: 'screenshots/screencapture-trinkerdrankwinkel-netlify-app-2026-05-14-19_38_55.png', tech: ['Next.js', 'Medusa.js', 'Stripe'], category: 'E-Commerce', description: 'A multilingual drink store with cart, checkout, and inventory management.' },
  { id: 'ubiquitous-toffee', name: 'Ubiquitous Toffee', screenshot: 'screenshots/screencapture-ubiquitous-toffee-2d31c3-netlify-app-2026-05-14-19_36_28.png', tech: ['React', 'Firebase', 'Tailwind'], category: 'Full Stack', description: 'A real-time collaborative project management dashboard for remote teams.' }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function getAccessToken(env, request) {
  // Check Authorization header first (client-side token storage)
  if (request) {
    const auth = request.headers.get('Authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }
  if (env.CANVA_KV) return env.CANVA_KV.get('canva_access_token', { type: 'text' });
  return env.CANVA_MANUAL_TOKEN || null;
}

const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';

function basicAuth(env) {
  return btoa(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`);
}

async function refreshAccessToken(env) {
  if (!env.CANVA_KV) return null;
  const refresh = await env.CANVA_KV.get('canva_refresh_token', { type: 'text' });
  if (!refresh) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh
  });
  const resp = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth(env)}`
    },
    body: body.toString()
  });
  if (!resp.ok) return null;
  const tokens = await resp.json();
  await env.CANVA_KV.put('canva_access_token', tokens.access_token, { expirationTtl: tokens.expires_in || 3600 });
  if (tokens.refresh_token) {
    await env.CANVA_KV.put('canva_refresh_token', tokens.refresh_token);
  }
  return tokens.access_token;
}

async function ensureToken(env, request) {
  let token = await getAccessToken(env, request);
  if (token) return token;
  return await refreshAccessToken(env);
}

function pollJob(jobId, endpoint, token, maxWait = 30000) {
  const url = `${CANVA_API}/${endpoint}/${jobId}`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - start > maxWait) return reject(new Error('Job timed out'));
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      if (data.job?.status === 'success') return resolve(data);
      if (data.job?.status === 'failed') return reject(new Error(data.job?.error?.message || 'Job failed'));
      setTimeout(poll, 1000);
    };
    poll();
  });
}

async function uploadAssetFromUrl(url, token) {
  const resp = await fetch(`${CANVA_API}/url-asset-uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!resp.ok) throw new Error(`Asset upload failed: ${await resp.text()}`);
  const { job } = await resp.json();
  const result = await pollJob(job.id, 'url-asset-uploads', token);
  return result.job.result?.asset?.id;
}

async function createDesign(width, height, title, assetId, token) {
  const body = {
    type: 'type_and_asset',
    design_type: { type: 'custom', width, height },
    title
  };
  if (assetId) body.asset_id = assetId;

  const resp = await fetch(`${CANVA_API}/designs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`Create design failed: ${await resp.text()}`);
  return await resp.json();
}

async function exportDesign(designId, format, token) {
  const resp = await fetch(`${CANVA_API}/exports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ design_id: designId, export_type: format || 'png' })
  });
  if (!resp.ok) throw new Error(`Export failed: ${await resp.text()}`);
  const { job } = await resp.json();
  const result = await pollJob(job.id, 'exports', token, 60000);
  return result.job.result?.export?.url;
}

// ── SVG Social Graphic Generator (fully automated, no Canva needed) ──

function generateSocialSVG(project, platform) {
  const isIG = platform === 'instagram';
  const W = isIG ? 1080 : 1200;
  const H = isIG ? 1080 : 627;
  const accent = '#84cc16';
  const bg = '#050a08';

  const layout = isIG ? `
    <image href="${project.screenshot}" x="40" y="40" width="1000" height="560" preserveAspectRatio="xMidYMid slice" clip-path="url(#imgClip)"/>
    <text x="40" y="660" font-family="Inter, Helvetica, sans-serif" font-size="52" font-weight="900" fill="${accent}" letter-spacing="-1">${escXml(project.name)}</text>
    <rect x="40" y="690" width="${project.category.length * 12 + 40}" height="32" rx="16" fill="${accent}" opacity="0.15"/>
    <text x="60" y="712" font-family="Inter, Helvetica, sans-serif" font-size="14" font-weight="700" fill="${accent}" letter-spacing="2" text-transform="uppercase">${escXml(project.category)}</text>
    <text x="40" y="770" font-family="Inter, Helvetica, sans-serif" font-size="22" fill="#9ca3af" font-weight="400">${escXml(project.description.substring(0, 100))}</text>
    <rect x="40" y="810" width="0" height="0"/>
    <text x="40" y="850" font-family="Inter, Helvetica, sans-serif" font-size="16" fill="#6b7280">${escXml(project.tech.join('  •  '))}</text>
    <line x1="40" y1="1010" x2="1040" y2="1010" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
    <text x="40" y="1045" font-family="Inter, Helvetica, sans-serif" font-size="14" font-weight="700" fill="${accent}" letter-spacing="3" text-transform="uppercase">GreenField Creatives</text>
    <text x="1040" y="1045" font-family="Inter, Helvetica, sans-serif" font-size="12" fill="#4b5563" text-anchor="end">greenfieldcreatives.co.za</text>
  ` : `
    <image href="${project.screenshot}" x="40" y="40" width="500" height="380" preserveAspectRatio="xMidYMid slice" clip-path="url(#imgClip)"/>
    <text x="580" y="100" font-family="Inter, Helvetica, sans-serif" font-size="40" font-weight="900" fill="${accent}" letter-spacing="-1">${escXml(project.name)}</text>
    <rect x="580" y="120" width="${project.category.length * 12 + 30}" height="26" rx="13" fill="${accent}" opacity="0.15"/>
    <text x="593" y="138" font-family="Inter, Helvetica, sans-serif" font-size="12" font-weight="700" fill="${accent}" letter-spacing="2" text-transform="uppercase">${escXml(project.category)}</text>
    <text x="580" y="185" font-family="Inter, Helvetica, sans-serif" font-size="18" fill="#9ca3af" font-weight="400">${escXml(project.description.substring(0, 90))}</text>
    <text x="580" y="280" font-family="Inter, Helvetica, sans-serif" font-size="14" fill="#6b7280">${escXml(project.tech.join('  •  '))}</text>
    <line x1="40" y1="567" x2="1160" y2="567" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
    <text x="40" y="600" font-family="Inter, Helvetica, sans-serif" font-size="13" font-weight="700" fill="${accent}" letter-spacing="3" text-transform="uppercase">GreenField Creatives</text>
    <text x="1160" y="600" font-family="Inter, Helvetica, sans-serif" font-size="11" fill="#4b5563" text-anchor="end">greenfieldcreatives.co.za</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="imgClip"><rect x="40" y="40" width="${isIG ? 1000 : 500}" height="${isIG ? 560 : 380}" rx="16"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#0a1710"/>
    </linearGradient>
    <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="0.8" fill="white" fill-opacity="0.04"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  ${layout}
</svg>`;
  return svg;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Route Handlers ───────────────────────────────────────────────────

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function generateVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

async function sha256(verifier) {
  const enc = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return base64url(hash);
}

async function handleCanvaOAuthInitiate(request, env) {
  const url = new URL(request.url);
  const verifier = generateVerifier();
  const challenge = await sha256(verifier);

  const redirectUri = url.origin + '/api/canva/oauth/callback';

  // Store verifier in state (base64 encoded JSON)
  const stateObj = { v: verifier, ts: Date.now() };
  const state = btoa(JSON.stringify(stateObj));

  const authUrl = `${CANVA_AUTH_URL}?${new URLSearchParams({
    client_id: env.CANVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    scope: 'design:content:write design:meta:read asset:read asset:write profile:read'
  })}`;
  return json({ authUrl });
}

function htmlPage(title, body, error) {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - GreenField Creatives</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#050a08;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:#0d1a13;border:1px solid rgba(132,204,22,0.2);border-radius:16px;padding:40px;max-width:480px;width:100%;text-align:center}h1{color:#84cc16;font-size:24px;margin:0 0 8px}p{color:#9ca3af;line-height:1.6;margin:0 0 8px}.detail{color:#6b7280;font-size:13px;word-break:break-word;background:#050a08;padding:12px;border-radius:8px;margin-top:16px;text-align:left;max-height:200px;overflow:auto}.btn{display:inline-block;margin-top:24px;padding:12px 24px;background:#84cc16;color:#050a08;text-decoration:none;border-radius:8px;font-weight:600}.error{color:#ef4444}${error ? '.error-icon{font-size:48px;margin-bottom:16px}' : '.success-icon{font-size:48px;margin-bottom:16px}'}</style></head><body><div class="card">${error ? '<div class="error-icon">&#10060;</div>' : '<div class="success-icon">&#10003;</div>'}${error ? `<h1 class="error">Connection Failed</h1><p>${body}</p>` : `<h1>Connected!</h1><p>${body}</p>`}${error ? `<p class="detail">${error}</p>` : ''}<a href="/content-studio" class="btn">Back to Content Studio</a></div></body></html>`, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
    status: error ? 400 : 200
  });
}

async function handleCanvaOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return htmlPage('Error', 'Missing authorization code from Canva.', 'No code parameter received.');

  let verifier = '';
  let stateError = '';
  if (state) {
    try {
      const stateObj = JSON.parse(atob(state));
      verifier = stateObj.v || '';
      if (!verifier) stateError = 'No code verifier found in state.';
    } catch {
      stateError = 'Failed to parse state parameter.';
    }
  } else {
    stateError = 'No state parameter received (CSRF protection).';
  }

  const redirectUri = url.origin + '/api/canva/oauth/callback';
  // Manually construct the body to ensure exact encoding
  const body = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_verifier=${encodeURIComponent(verifier)}`;

  const resp = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth(env)}`
    },
    body
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const detail = errText.length > 500 ? errText.substring(0, 500) + '...' : errText;
    const msg = stateError || 'Could not exchange authorization code for access token.';
    return htmlPage('Error', msg, detail);
  }

  const tokens = await resp.json();

  // Store in KV if available
  if (env.CANVA_KV) {
    await env.CANVA_KV.put('canva_access_token', tokens.access_token, { expirationTtl: tokens.expires_in || 3600 });
    if (tokens.refresh_token) await env.CANVA_KV.put('canva_refresh_token', tokens.refresh_token);
  }

  // Also pass token to client via URL hash for sessionStorage
  const tokenHash = `#access_token=${encodeURIComponent(tokens.access_token)}${tokens.refresh_token ? '&refresh_token=' + encodeURIComponent(tokens.refresh_token) : ''}`;
  const adminUrl = `/content-studio${tokenHash}`;
  return Response.redirect(new URL(adminUrl, url.origin), 302);
}

async function handleCanvaStatus(request, env) {
  const token = await ensureToken(env, request);
  const connected = !!token;
  const clientConfigured = !!(env.CANVA_CLIENT_ID && env.CANVA_CLIENT_SECRET);

  return json({
    connected,
    clientConfigured,
    projects: PORTFOLIO_PROJECTS
  });
}

async function handleGenerateCanva(request, env) {
  const token = await ensureToken(env, request);
  if (!token) return json({ error: 'Canva not connected' }, 401);

  const body = await request.json();
  const { projectId, platform } = body;
  if (!projectId || !platform) return json({ error: 'projectId and platform required' }, 400);

  const project = PORTFOLIO_PROJECTS.find(p => p.id === projectId);
  if (!project) return json({ error: 'Project not found' }, 404);

  const isIG = platform === 'instagram';
  const width = isIG ? 1080 : 1200;
  const height = isIG ? 1080 : 627;

  try {
    const siteUrl = new URL(request.url).origin;
    const screenshotUrl = `${siteUrl}/${project.screenshot}`;

    // Upload screenshot to Canva
    const assetId = await uploadAssetFromUrl(screenshotUrl, token);

    // Create a custom-sized design with the screenshot embedded
    const result = await createDesign(
      width, height,
      `Social - ${project.name} (${platform})`,
      assetId,
      token
    );

    // Try to export as PNG
    let exportUrl = null;
    try {
      exportUrl = await exportDesign(result.design.id, 'png', token);
    } catch {}

    return json({
      success: true,
      design: {
        id: result.design.id,
        title: result.design.title,
        editUrl: result.design.urls?.edit_url,
        viewUrl: result.design.urls?.view_url,
        exportUrl,
        thumbnail: result.design.thumbnail?.url || null,
        assetId
      }
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleGenerateSVG(request) {
  const body = await request.json();
  const { projectId, platform } = body;
  if (!projectId || !platform) return json({ error: 'projectId and platform required' }, 400);

  const project = PORTFOLIO_PROJECTS.find(p => p.id === projectId);
  if (!project) return json({ error: 'Project not found' }, 404);

  const svg = generateSocialSVG(project, platform);
  const isIG = platform === 'instagram';
  const label = `${project.id}-${platform}-${Date.now()}`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `inline; filename="${label}.svg"`,
      'Cache-Control': 'no-cache'
    }
  });
}

async function handleBulkGenerate(request, env) {
  const body = await request.json();
  const { projectIds, platforms, method } = body;
  if (!projectIds?.length || !platforms?.length) {
    return json({ error: 'projectIds and platforms required' }, 400);
  }

  if (method === 'svg') {
    const results = [];
    for (const projectId of projectIds) {
      for (const platform of platforms) {
        const project = PORTFOLIO_PROJECTS.find(p => p.id === projectId);
        if (!project) { results.push({ projectId, platform, error: 'not found' }); continue; }
        results.push({ projectId, platform, svg: generateSocialSVG(project, platform) });
      }
    }
    return json({ results });
  }

  // Canva method
  const token = await ensureToken(env, request);
  if (!token) return json({ error: 'Canva not connected' }, 401);

  const results = [];
  for (const projectId of projectIds) {
    for (const platform of platforms) {
      try {
        const req = new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': request.headers.get('Authorization') || '' },
          body: JSON.stringify({ projectId, platform })
        });
        const res = await handleGenerateCanva(req, env);
        const data = await res.json();
        results.push({ projectId, platform, ...data });
      } catch (err) {
        results.push({ projectId, platform, error: err.message });
      }
    }
  }
  return json({ results });
}

async function handleContactForm(request, env) {
  try {
    const data = await request.json();
    const { name, email, phone, ref, subject, message } = data;
    if (!name || !email || !message) return json({ error: 'Missing required fields' }, 400);

    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return json({ error: 'Telegram not configured' }, 500);

    const text = [
      `*New inquiry from GreenField Creatives*`,
      ``,
      `*Name:* ${name}`,
      `*Email:* ${email}`,
      `*Phone:* ${phone || 'Not provided'}`,
      `*Reference:* ${ref || 'Not provided'}`,
      `*Subject:* ${subject || 'Not provided'}`,
      `*Message:* ${message}`
    ].join('\n');

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });

    if (!response.ok) {
      const err = await response.text();
      return json({ error: 'Telegram API error', detail: err }, 500);
    }
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── Main Router ──────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }

    // ── Canva API ──
    if (path === '/api/canva/oauth/initiate' && request.method === 'POST') return handleCanvaOAuthInitiate(request, env);
    if (path === '/api/canva/oauth/callback' && request.method === 'GET') return handleCanvaOAuthCallback(request, env);
    if (path === '/api/canva/status' && request.method === 'GET') return handleCanvaStatus(request, env);
    if (path === '/api/canva/generate' && request.method === 'POST') return handleGenerateCanva(request, env);
    if (path === '/api/canva/bulk-generate' && request.method === 'POST') return handleBulkGenerate(request, env);

    // ── PKCE Debug ──
    if (path === '/api/debug/pkce') {
      const testV = 'test-verifier-abc123';
      const enc = new TextEncoder().encode(testV);
      const hash = await crypto.subtle.digest('SHA-256', enc);
      const hashArr = Array.from(new Uint8Array(hash));
      const b64url = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      return json({ testV, hashHex: hashArr.map(b => b.toString(16).padStart(2,'0')).join(''), b64url });
    }

    // ── SVG Generation (fully automated, no Canva needed) ──
    if (path === '/api/svg/generate' && request.method === 'POST') return handleGenerateSVG(request);

    // ── Projects API ──
    if (path === '/api/projects' && request.method === 'GET') return json(PORTFOLIO_PROJECTS);

    // ── Contact ──
    if (path === '/contact' && request.method === 'POST') return handleContactForm(request, env);

    // ── Static assets ──
    const response = await env.ASSETS.fetch(request);
    const newHeaders = new Headers(response.headers);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => newHeaders.set(key, value));

    const ext = url.pathname.match(/\.(\w+)$/)?.[0];
    if (ext && CACHE_EXTENSIONS.includes(ext)) {
      newHeaders.set('Cache-Control', `public, max-age=${CACHE_DURATION}, immutable`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
