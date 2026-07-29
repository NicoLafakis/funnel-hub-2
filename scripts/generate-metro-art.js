#!/usr/bin/env node
/* Batch generator for Flywheel's per-metro textures and HUD/UI icons.

   Submits PixelLab `create_image_pro` jobs (1 generation each), polls them with
   `get_image`, downloads the results, verifies each file really is a PNG, and
   rewrites assets/art-manifest.json at the end.

   RESUMABLE: a slot whose PNG already exists on disk (and validates as a real
   PNG) is skipped without any API call, and in-flight job ids are checkpointed
   to art-generation-state.json, so an interrupted run costs nothing to restart.

   QUOTA-SAFE: on a credit/quota error it stops submitting new work, drains what
   is already in flight, writes the manifest for whatever landed, and reports.

   API key: env PIXELLAB_API_KEY, or a .pixellab-key file in the repo root (gitignored).

   Usage:
     node scripts/generate-metro-art.js                 # everything still missing
     node scripts/generate-metro-art.js --textures      # metro textures only
     node scripts/generate-metro-art.js --icons         # icons only
     node scripts/generate-metro-art.js --only neon     # jobs whose key matches a substring
     node scripts/generate-metro-art.js --limit 5       # cap how many jobs to run
     node scripts/generate-metro-art.js --dry-run       # list what would be generated
*/
const fs = require('fs');
const path = require('path');
const {
  ROOT, callTool, extractText, extractInlineImage, extractJobId, extractUrls,
  looksLikeQuotaError, looksLikeRateLimit, downloadFile, isValidPng, writeBase64Png, sleep,
} = require('./pixellab');
const { buildJobs } = require('./art-spec');
const { writeManifest } = require('./build-art-manifest');

const STATE_PATH = path.join(ROOT, 'art-generation-state.json');
// PixelLab caps concurrent jobs server-side (observed: 10). Stay under it so a
// submit is rejected only rarely, and treat rejections as back-pressure.
const CONCURRENCY = 6;       // jobs in flight at once
const POLL_INTERVAL = 6000;  // ms between poll sweeps
const MAX_ATTEMPTS = 3;      // submit attempts per job before giving up
const MAX_POLLS = 60;        // poll sweeps a single job may sit through

const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const flagValue = f => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function selectJobs() {
  let jobs = buildJobs();
  if (hasFlag('--textures')) jobs = jobs.filter(j => j.category === 'texture');
  if (hasFlag('--icons')) jobs = jobs.filter(j => j.category === 'icon');
  const only = flagValue('--only');
  if (only) jobs = jobs.filter(j => j.key.includes(only));
  const limit = Number(flagValue('--limit'));
  if (Number.isFinite(limit) && limit > 0) jobs = jobs.slice(0, limit);
  return jobs;
}

// Submits one job. Returns { jobId } | { quota: true } | { error: string }.
async function submit(job) {
  const result = await callTool('create_image_pro', {
    description: job.prompt,
    width: job.width,
    height: job.height,
    no_background: job.transparent,
  });
  const text = extractText(result);
  const jobId = extractJobId(text);
  if (jobId) return { jobId };
  if (looksLikeRateLimit(text)) return { rateLimited: true, error: text.slice(0, 200) };
  if (looksLikeQuotaError(text)) return { quota: true, error: text.slice(0, 200) };
  return { error: text.slice(0, 200) };
}

// Polls one job id. Returns 'pending' | 'saved' | 'failed'.
async function poll(job, dest) {
  const result = await callTool('get_image', { job_id: job.jobId });
  const text = extractText(result);

  if (/processing|queued|pending|in progress/i.test(text)) return 'pending';

  const inline = extractInlineImage(result);
  if (inline && writeBase64Png(inline.data, dest)) return 'saved';

  const urls = extractUrls(text).filter(u => /\.png|backblaze|storage|amazonaws|r2\.|blob/i.test(u));
  if (urls.length) {
    try {
      await downloadFile(urls[0], dest);
      if (isValidPng(dest)) return 'saved';
      fs.unlinkSync(dest);
    } catch { /* fall through to failed */ }
  }

  if (inline) return 'failed'; // had data but it was not a real PNG
  if (/fail|error|not found|invalid/i.test(text)) return 'failed';
  return 'pending';
}

async function main() {
  const all = selectJobs();
  const state = loadState();

  const todo = [];
  let already = 0;
  for (const job of all) {
    const dest = path.join(ROOT, job.relPath);
    if (isValidPng(dest)) { already++; continue; }
    job.dest = dest;
    job.attempts = 0;
    job.polls = 0;
    const saved = state[job.key];
    if (saved && saved.jobId) { job.jobId = saved.jobId; job.attempts = 1; }
    todo.push(job);
  }

  console.log(`Assets in spec: ${all.length}`);
  console.log(`Already on disk (skipped): ${already}`);
  console.log(`To generate: ${todo.length}`);
  const resumed = todo.filter(j => j.jobId).length;
  if (resumed) console.log(`Resuming ${resumed} previously-submitted job(s) from art-generation-state.json`);

  if (hasFlag('--dry-run')) {
    todo.forEach(j => console.log(`  ${j.key} -> ${j.relPath}`));
    return;
  }

  if (todo.length === 0) {
    const { dest, counts } = writeManifest();
    console.log(`\nNothing to do. Manifest refreshed: ${dest} (${counts.textures} textures, ${counts.icons} icons)`);
    return;
  }

  const queue = todo.filter(j => !j.jobId);
  const inFlight = todo.filter(j => j.jobId);
  const done = [];
  const failed = [];
  let quotaHit = false;

  while (inFlight.length > 0 || (queue.length > 0 && !quotaHit)) {
    // Top up the in-flight pool.
    while (!quotaHit && inFlight.length < CONCURRENCY && queue.length > 0) {
      const job = queue.shift();
      job.attempts++;
      const res = await submit(job);
      if (res.rateLimited) {
        // Server-side concurrency cap, not our failure: put the job back at the
        // front, refund the attempt, and let the poll sleep drain the pool.
        job.attempts--;
        queue.unshift(job);
        console.log('  (server busy — waiting for in-flight jobs to drain)');
        break;
      }
      if (res.quota) {
        quotaHit = true;
        queue.unshift(job);
        console.log(`\n!! QUOTA/CREDIT LIMIT reached while submitting ${job.key}: ${res.error}`);
        console.log('   Halting new submissions; draining jobs already in flight.\n');
        break;
      }
      if (res.jobId) {
        job.jobId = res.jobId;
        job.polls = 0;
        state[job.key] = { jobId: res.jobId, relPath: job.relPath, submittedAt: new Date().toISOString() };
        saveState(state);
        inFlight.push(job);
        console.log(`  submitted ${job.key} (${res.jobId.slice(0, 8)})`);
      } else {
        console.log(`  submit failed ${job.key}: ${res.error}`);
        if (job.attempts < MAX_ATTEMPTS) queue.push(job);
        else failed.push(job);
      }
      await sleep(250);
    }

    if (inFlight.length === 0) {
      // Nothing in flight: either we're done, or the server pushed back on
      // every submit — in that case wait and try the queue again.
      if (queue.length === 0 || quotaHit) break;
      await sleep(POLL_INTERVAL);
      continue;
    }

    await sleep(POLL_INTERVAL);

    for (let i = inFlight.length - 1; i >= 0; i--) {
      const job = inFlight[i];
      job.polls++;
      let status;
      try { status = await poll(job, job.dest); }
      catch (e) { console.log(`  poll error ${job.key}: ${e.message}`); status = 'pending'; }

      if (status === 'saved') {
        inFlight.splice(i, 1);
        delete state[job.key];
        saveState(state);
        done.push(job);
        console.log(`  OK ${job.key} -> ${job.relPath} (${fs.statSync(job.dest).size} bytes)`);
      } else if (status === 'failed' || job.polls > MAX_POLLS) {
        inFlight.splice(i, 1);
        delete state[job.key];
        saveState(state);
        job.jobId = null;
        if (job.attempts < MAX_ATTEMPTS && !quotaHit) {
          queue.push(job);
          console.log(`  retrying ${job.key} (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`);
        } else {
          failed.push(job);
          console.log(`  FAILED ${job.key} after ${job.attempts} attempt(s)`);
        }
      }
      await sleep(150);
    }
  }

  const notAttempted = queue.filter(j => !failed.includes(j));

  const { dest: manifestPath, counts } = writeManifest();

  console.log('\n=== SUMMARY ===');
  const byCat = c => done.filter(j => j.category === c).length;
  console.log(`Generated this run: ${done.length}  (textures ${byCat('texture')}, icons ${byCat('icon')})`);
  console.log(`Failed:             ${failed.length}`);
  console.log(`Not attempted:      ${notAttempted.length}${quotaHit ? ' (quota limit)' : ''}`);
  failed.forEach(j => console.log(`  FAILED ${j.key}`));
  console.log(`\nManifest: ${manifestPath}`);
  console.log(`  textures listed: ${counts.textures}`);
  console.log(`  icons listed:    ${counts.icons}`);
  console.log(`  still missing:   ${counts.missing.length}`);
  if (quotaHit) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
