#!/usr/bin/env node
/* Minimal PixelLab image generation client (REST v2, api.pixellab.ai).
   Usage:
     node scripts/pixellab.js gen "<prompt>" <width> <height> <outfile.png> [--pro] [--view top_down]
       pixflux (default): sync, 16-400px per axis, pixel-art city surfaces.
       --pro (generate-image-v2): up to 792x688, richer detail, higher cost.
   API key: env PIXELLAB_API_KEY, or a .pixellab file in the repo root (gitignored).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.pixellab.ai/v2';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function apiKey() {
  if (process.env.PIXELLAB_API_KEY) return process.env.PIXELLAB_API_KEY.trim();
  const f = path.join(root, '.pixellab');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('No API key. Set PIXELLAB_API_KEY or create .pixellab in the repo root.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, endpoint, body) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(BASE + endpoint, {
        method,
        headers: {
          Authorization: 'Bearer ' + apiKey(),
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { _raw: text }; }
      if (!res.ok) {
        console.error(`API ${method} ${endpoint} -> ${res.status}`);
        console.error(JSON.stringify(json, null, 2).slice(0, 2000));
        process.exit(1);
      }
      return json;
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (attempt + 1));
    }
  }
  console.error('Network error after retries: ' + (lastErr && lastErr.message));
  process.exit(1);
}

function saveBase64Image(payload, outfile) {
  // Responses carry { image: { type: 'base64', base64: 'data:image/png;base64,...' } }
  const b64 = payload && payload.image && payload.image.base64;
  if (!b64) {
    console.error('No image in response: ' + JSON.stringify(payload).slice(0, 800));
    process.exit(1);
  }
  const data = b64.includes(',') ? b64.split(',')[1] : b64;
  fs.writeFileSync(outfile, Buffer.from(data, 'base64'));
  const usage = payload.usage ? ` usage=${JSON.stringify(payload.usage)}` : '';
  console.log(`saved ${outfile}${usage}`);
}

async function pollJob(jobId, outfile) {
  for (let i = 0; i < 60; i += 1) {
    await sleep(3000);
    const j = await api('GET', `/background-jobs/${jobId}`);
    const status = j.status || (j.last_response && j.last_response.status);
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      saveBase64Image(j.last_response || j, outfile);
      return;
    }
    if (status === 'failed' || status === 'error') {
      console.error('Job failed: ' + JSON.stringify(j).slice(0, 800));
      process.exit(1);
    }
  }
  console.error('Job timed out: ' + jobId);
  process.exit(1);
}

async function cmdGen(args) {
  const [prompt, w, h, outfile] = args;
  if (!prompt || !w || !h || !outfile) {
    console.error('usage: gen "<prompt>" <width> <height> <outfile.png> [--pro] [--view top_down]');
    process.exit(1);
  }
  const pro = args.includes('--pro');
  const viewIdx = args.indexOf('--view');
  const view = viewIdx >= 0 ? args[viewIdx + 1] : null;
  const size = { width: parseInt(w, 10), height: parseInt(h, 10) };

  if (pro) {
    const res = await api('POST', '/generate-image-v2', {
      description: prompt,
      image_size: size,
      no_background: false,
    });
    if (res.background_job_id || res.job_id) return pollJob(res.background_job_id || res.job_id, outfile);
    return saveBase64Image(res, outfile);
  }

  const body = {
    description: prompt,
    image_size: size,
    no_background: false,
  };
  if (view) body.view = view;
  const res = await api('POST', '/create-image-pixflux', body);
  return saveBase64Image(res, outfile);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'gen') await cmdGen(rest);
else {
  console.error('usage: node scripts/pixellab.js gen "<prompt>" <w> <h> <out.png> [--pro] [--view top_down]');
  process.exit(1);
}
