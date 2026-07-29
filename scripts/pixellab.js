/* Shared PixelLab MCP client for Flywheel's art-generation scripts.
   Single home for the API key lookup, the JSON-RPC-over-SSE transport, and the
   download/PNG-validation helpers, so no script re-implements (or re-hardcodes) them.

   API key resolution order:
     1. process.env.PIXELLAB_API_KEY
     2. .pixellab-key file in the repo root (gitignored)
   Exits with a clear error if neither is present. NEVER hardcode the key.
*/
const fs = require('fs');
const path = require('path');

const MCP_URL = 'https://api.pixellab.ai/mcp';
const ROOT = path.resolve(__dirname, '..');

let cachedKey = null;

function apiKey() {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.PIXELLAB_API_KEY && process.env.PIXELLAB_API_KEY.trim();
  if (fromEnv) { cachedKey = fromEnv; return cachedKey; }
  const keyFile = path.join(ROOT, '.pixellab-key');
  if (fs.existsSync(keyFile)) {
    const fromFile = fs.readFileSync(keyFile, 'utf8').trim();
    if (fromFile) { cachedKey = fromFile; return cachedKey; }
  }
  console.error(
    'No PixelLab API key found.\n' +
    '  Set the PIXELLAB_API_KEY environment variable, or create a .pixellab-key\n' +
    `  file (gitignored) in the repo root: ${ROOT}`
  );
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One JSON-RPC call over the MCP HTTP endpoint. The server answers with an SSE
// stream ("data: {...}" lines) or, occasionally, a plain JSON body — handle both.
async function callMcp(method, params = {}) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now() + Math.floor(Math.random() * 100000),
    method,
    params,
  });
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: payload,
  });
  const body = await res.text();
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('data: ')) {
      try { return JSON.parse(line.slice(6)); } catch { /* keep scanning */ }
    }
  }
  try { return JSON.parse(body); }
  catch { return { error: { code: res.status, message: 'parse_failed' }, raw: body.slice(0, 500) }; }
}

let initialized = false;

async function initialize(clientName = 'flywheel-art', version = '1.0') {
  if (initialized) return;
  await callMcp('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: clientName, version },
  });
  initialized = true;
}

async function callTool(name, args) {
  await initialize();
  return callMcp('tools/call', { name, arguments: args });
}

// Flatten an MCP tool result's content blocks to plain text.
function extractText(result) {
  if (result && result.result && Array.isArray(result.result.content)) {
    return result.result.content.map(c => c.text || '').join('\n');
  }
  if (result && result.error) return JSON.stringify(result.error);
  return JSON.stringify(result || {}).slice(0, 500);
}

// The first inline base64 image block in an MCP tool result, if any.
function extractInlineImage(result) {
  const content = (result && result.result && result.result.content) || [];
  return content.find(c => c.type === 'image' && c.data) || null;
}

// PixelLab replies with a human-readable blob whose first line is "id: <uuid>".
function extractJobId(text) {
  const m = /\bid:\s*([0-9a-f-]{36})/i.exec(text || '');
  return m ? m[1] : null;
}

// True when a tool result reads as "out of credits / quota exhausted".
// Deliberately excludes "rate limit exceeded", which is a TRANSIENT concurrency
// cap (PixelLab allows ~10 jobs in flight), not an exhausted balance.
function looksLikeQuotaError(text) {
  const t = text || '';
  if (looksLikeRateLimit(t)) return false;
  return /insufficient|quota|out of credit|credits remaining|billing|payment required|402|too many generations|limit reached/i.test(t);
}

// True for the transient "too many concurrent jobs" back-pressure signal.
// Callers should wait and retry WITHOUT consuming a retry attempt.
function looksLikeRateLimit(text) {
  return /rate limit|too many requests|429|\b\d+\/\d+ jobs\b/i.test(text || '');
}

function extractUrls(text) {
  const urls = [];
  const re = /https?:\/\/[^\s"'<>)\]]+/g;
  let m;
  while ((m = re.exec(text || '')) !== null) urls.push(m[0]);
  return urls;
}

async function downloadFile(url, destPath, redirects = 0) {
  if (redirects > 5) throw new Error('too many redirects');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url.slice(0, 80)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A file counts as a real PNG only with the 8-byte signature AND a non-trivial
// size — an API error payload saved with a .png extension fails both.
function isValidPng(filePath, minBytes = 128) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < minBytes) return false;
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    return head.equals(PNG_MAGIC);
  } catch {
    return false;
  }
}

// Write base64 image data and verify it landed as a real PNG; deletes on failure.
function writeBase64Png(base64, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(base64, 'base64'));
  if (!isValidPng(destPath)) {
    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
    return false;
  }
  return true;
}

module.exports = {
  ROOT,
  MCP_URL,
  apiKey,
  sleep,
  callMcp,
  initialize,
  callTool,
  extractText,
  extractInlineImage,
  extractJobId,
  extractUrls,
  looksLikeQuotaError,
  looksLikeRateLimit,
  downloadFile,
  isValidPng,
  writeBase64Png,
};
