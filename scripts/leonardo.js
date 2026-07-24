#!/usr/bin/env node
/* Minimal Leonardo AI image generation client.
   Usage:
     node scripts/leonardo.js me
     node scripts/leonardo.js models [filter]
     node scripts/leonardo.js gen "<prompt>" <width> <height> <outfile.png> [modelNameFilter]
   API key: env LEONARDO_API_KEY, or a .leonardo-key file in the repo root (gitignored).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://cloud.leonardo.ai/api/rest/v1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function apiKey() {
  if (process.env.LEONARDO_API_KEY) return process.env.LEONARDO_API_KEY.trim();
  const f = path.join(root, '.leonardo-key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('No API key. Set LEONARDO_API_KEY or create .leonardo-key in the repo root.');
  process.exit(1);
}

async function api(method, endpoint, body) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + endpoint, {
        method,
        headers: {
          'Authorization': 'Bearer ' + apiKey(),
          'Content-Type': 'application/json',
          'accept': 'application/json',
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cmdMe() {
  const j = await api('GET', '/me');
  const u = (j.user_details && j.user_details[0]) || j;
  console.log(JSON.stringify({ user: u.user ? u.user.username : undefined, apiCreditBalance: u.apiCreditBalance, apiPaidTokens: u.apiPaidTokens, apiPlanTokenBalance: u.apiPlanTokenBalance }, null, 2));
}

async function cmdModels(filter) {
  const j = await api('GET', '/platformModels');
  const models = j.custom_models || j.platform_models || [];
  models
    .filter(m => !filter || (m.name || '').toLowerCase().includes(filter.toLowerCase()))
    .forEach(m => console.log(`${m.id}  ${m.name}${m.nsfw ? '  [nsfw]' : ''}`));
}

async function pickModel(filter) {
  const j = await api('GET', '/platformModels');
  const models = j.custom_models || j.platform_models || [];
  if (filter) {
    const m = models.find(m => (m.name || '').toLowerCase().includes(filter.toLowerCase()));
    if (m) return m;
    console.error(`No model matching "${filter}". Available:`);
    models.forEach(m => console.error(`  ${m.name}`));
    process.exit(1);
  }
  const preferred = ['lucid origin', 'phoenix', 'kino xl', 'diffusion xl'];
  for (const p of preferred) {
    const m = models.find(m => (m.name || '').toLowerCase().includes(p));
    if (m) return m;
  }
  return models[0];
}

async function cmdGen(prompt, width, height, outfile, modelFilter) {
  const model = await pickModel(modelFilter);
  console.error(`Model: ${model.name} (${model.id})`);
  const create = await api('POST', '/generations', {
    prompt,
    num_images: 1,
    width: +width,
    height: +height,
    modelId: model.id,
    public: false,
  });
  const job = create.sdGenerationJob || create.sd_generation_job || create;
  const id = job.generationId || job.generation_id;
  if (!id) { console.error('No generationId in response:', JSON.stringify(create).slice(0, 1000)); process.exit(1); }
  console.error(`Generation ${id} submitted, polling...`);
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const g = await api('GET', '/generations/' + id);
    const gen = g.generations_by_pk || g.generation || g;
    if (gen.status === 'COMPLETE') {
      const imgs = gen.generated_images || [];
      if (!imgs.length) { console.error('COMPLETE but no images'); process.exit(1); }
      const url = imgs[0].url;
      await download(url, outfile);
      console.log(url);
      return;
    }
    if (gen.status === 'FAILED') { console.error('Generation FAILED'); process.exit(1); }
    process.stderr.write('.');
  }
  console.error('Timed out waiting for generation');
  process.exit(1);
}

async function download(url, outfile) {
  let lastErr;
  for (let a = 0; a < 8; a++) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error('download ' + imgRes.status);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      fs.mkdirSync(path.dirname(path.resolve(outfile)), { recursive: true });
      fs.writeFileSync(outfile, buf);
      console.error(`Saved ${outfile} (${buf.length} bytes)`);
      return;
    } catch (e) { lastErr = e; await sleep(2000 * (a + 1)); }
  }
  console.error('Download failed: ' + (lastErr && lastErr.message));
  process.exit(1);
}

/* Find the downloadable URL in any generation payload, shape-agnostic. */
function findAssetUrl(gen) {
  const imgs = gen.generated_images || [];
  if (imgs[0]) {
    if (imgs[0].motionMP4URL) return imgs[0].motionMP4URL;
    if (imgs[0].url) return imgs[0].url;
  }
  const m = JSON.stringify(gen).match(/https:\\?\/\\?\/[^"\\]+\.(?:mp4|png|jpg|jpeg)/i);
  return m ? m[0].replace(/\\\//g, '/') : null;
}

/* Poll an existing generation id and download whatever it produced. */
async function cmdGrab(id, outfile) {
  console.error(`Polling generation ${id}...`);
  for (let i = 0; i < 90; i++) {
    const g = await api('GET', '/generations/' + id);
    const gen = g.generations_by_pk || g.generation || g;
    if (gen.status === 'COMPLETE') {
      const url = findAssetUrl(gen);
      if (!url) { console.error('COMPLETE but no asset URL found:', JSON.stringify(gen).slice(0, 1200)); process.exit(1); }
      await download(url, outfile);
      console.log(url);
      return;
    }
    if (gen.status === 'FAILED') { console.error('Generation FAILED'); process.exit(1); }
    if (i === 0) console.error(`status: ${gen.status || 'unknown'}, waiting...`);
    await sleep(5000);
  }
  console.error('Timed out');
  process.exit(1);
}

async function cmdUpload(file) {
  const ext = (path.extname(file).slice(1).toLowerCase() || 'png').replace('jpg', 'jpeg');
  const init = await api('POST', '/init-image', { extension: ext });
  const up = init.uploadInitImage;
  if (!up) { console.error('Unexpected /init-image response:', JSON.stringify(init).slice(0, 800)); process.exit(1); }
  const fields = typeof up.fields === 'string' ? JSON.parse(up.fields) : up.fields;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  let lastErr;
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(up.url, { method: 'POST', body: form });
      if (res.ok || res.status === 204) return up.id;
      lastErr = new Error('S3 ' + res.status);
    } catch (e) { lastErr = e; }
    await sleep(1500 * (a + 1));
  }
  console.error('Upload failed: ' + (lastErr && lastErr.message));
  process.exit(1);
}

async function cmdMotion(file, outfile, prompt) {
  const imageId = await cmdUpload(file);
  console.error(`Uploaded init image ${imageId}, requesting motion...`);
  const create = await api('POST', '/generations-image-to-video', {
    imageId,
    imageType: 'UPLOADED',
    prompt: prompt || 'slow cinematic swirling motion, objects drifting toward the center, seamless loop',
  });
  const job = create.motionVideoGenerationJob || create;
  const id = job.generationId || job.generation_id;
  if (!id) { console.error('No generationId in motion response:', JSON.stringify(create).slice(0, 1000)); process.exit(1); }
  console.error(`Motion generation ${id} submitted (cost: ${JSON.stringify(job.cost || '?')})`);
  await cmdGrab(id, outfile);
}

const [cmd, ...args] = process.argv.slice(2);
(async () => {
  if (cmd === 'me') await cmdMe();
  else if (cmd === 'models') await cmdModels(args[0]);
  else if (cmd === 'gen' && args.length >= 4) await cmdGen(...args);
  else if (cmd === 'upload' && args.length >= 1) console.log(await cmdUpload(args[0]));
  else if (cmd === 'motion' && args.length >= 2) await cmdMotion(...args);
  else if (cmd === 'grab' && args.length >= 2) await cmdGrab(...args);
  else {
    console.error('Usage: leonardo.js me | models [filter] | gen "<prompt>" <w> <h> <outfile> [modelFilter] | upload <file> | motion <imageFile> <outfile.mp4> [prompt] | grab <generationId> <outfile>');
    process.exit(1);
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
