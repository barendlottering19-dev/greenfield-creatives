const TELEGRAM_API = 'https://api.telegram.org/bot';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const CACHE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
const CACHE_DURATION = 31536000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/contact' && request.method === 'POST') {
      try {
        const data = await request.json();
        const { name, email, subject, message } = data;

        if (!name || !email || !message) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const token = env.TELEGRAM_BOT_TOKEN;
        const chatId = env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
          return new Response(JSON.stringify({ error: 'Telegram not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const text = [
          `*New inquiry from GreenField Creatives*`,
          ``,
          `*Name:* ${name}`,
          `*Email:* ${email}`,
          `*Subject:* ${subject || 'Not provided'}`,
          `*Message:* ${message}`
        ].join('\n');

        const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
          })
        });

        if (!response.ok) {
          const err = await response.text();
          return new Response(JSON.stringify({ error: 'Telegram API error', detail: err }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const response = await env.ASSETS.fetch(request);
    const newHeaders = new Headers(response.headers);

    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

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
