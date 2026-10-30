// Shared helpers for the Claude-backed functions. The API key stays server-side.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

const json = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

const configured = () => !!process.env.ANTHROPIC_API_KEY;

async function callClaude({ system, user, maxTokens = 2000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API: ${(data.error && data.error.message) || res.status}`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

/** The model is told to reply with JSON only, but strip any fence or chatter around it. */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

/** A known tag and a short single-line reason, or null. */
function cleanTag(t) {
  if (!t || (t.tag !== 'Business' && t.tag !== 'Personal')) return null;
  const reason = String(t.reason == null ? '' : t.reason).replace(/\s+/g, ' ').trim().slice(0, 140);
  return reason ? { tag: t.tag, reason } : null;
}

/** Reads and bounds a JSON request body. Returns null if it is missing, too large or not JSON. */
function readBody(event, maxBytes = 40000) {
  const raw = event.body || '';
  if (!raw || raw.length > maxBytes) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

module.exports = { json, configured, callClaude, extractJson, cleanTag, readBody, MODEL };
