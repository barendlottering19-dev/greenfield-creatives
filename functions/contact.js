const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const data = await request.json();
    const { name, email, subject, message } = data;

    if (!name || !email || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return Response.json({ error: 'Telegram not configured' }, { status: 500 });
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
      return Response.json({ error: 'Telegram API error', detail: err }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
