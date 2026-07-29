#!/usr/bin/env node
/* Regenerates the worst-wrapping ground textures and keeps whichever attempt
   tiles best — generation is stochastic, so a reroll is the cheapest fix for a
   visible seam. Only ever REPLACES a file when the new one scores strictly
   better, so running this can't make the art worse.

   Ground textures only by default: they repeat many times across the level
   plane, where a seam is obvious. Facades repeat once or twice per building
   face and are allowed to have a designed top/bottom cornice.

   Usage:
     node scripts/retile-worst.js                 # 3 worst, 1 reroll each
     node scripts/retile-worst.js --count 5 --rounds 2
     node scripts/retile-worst.js --threshold 25  # only touch textures above this
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, callTool, extractText, extractInlineImage, extractJobId, extractUrls,
        looksLikeQuotaError, looksLikeRateLimit, downloadFile, isValidPng, writeBase64Png, sleep } = require('./pixellab');
const { buildJobs } = require('./art-spec');
const { seamScore } = require('./png-tiling');
const { writeManifest } = require('./build-art-manifest');

const argv = process.argv.slice(2);
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
};

const COUNT = num('--count', 3);
const ROUNDS = num('--rounds', 1);
const THRESHOLD = num('--threshold', 25);

async function generateTo(job, dest) {
  const submitted = await callTool('create_image_pro', {
    description: job.prompt,
    width: job.width,
    height: job.height,
    no_background: job.transparent,
  });
  const text = extractText(submitted);
  const jobId = extractJobId(text);
  if (!jobId) {
    if (looksLikeRateLimit(text)) return { retryable: true, error: 'rate limited' };
    if (looksLikeQuotaError(text)) return { quota: true, error: text.slice(0, 200) };
    return { error: text.slice(0, 200) };
  }
  for (let i = 0; i < 40; i++) {
    await sleep(6000);
    const res = await callTool('get_image', { job_id: jobId });
    const t = extractText(res);
    if (/processing|queued|pending/i.test(t)) continue;
    const inline = extractInlineImage(res);
    if (inline && writeBase64Png(inline.data, dest)) return { ok: true };
    const urls = extractUrls(t).filter(u => /\.png|storage|backblaze|amazonaws|blob/i.test(u));
    if (urls.length) {
      try {
        await downloadFile(urls[0], dest);
        if (isValidPng(dest)) return { ok: true };
        fs.unlinkSync(dest);
      } catch { /* fall through */ }
    }
    return { error: t.slice(0, 160) };
  }
  return { error: 'timed out' };
}

async function main() {
  const grounds = buildJobs().filter(
    j => j.category === 'texture' && (j.slot === 'street' || j.slot === 'sidewalk')
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flywheel-retile-'));
  let improved = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    const ranked = grounds
      .map(j => ({ job: j, abs: path.join(ROOT, j.relPath) }))
      .filter(e => isValidPng(e.abs))
      .map(e => ({ ...e, ...seamScore(e.abs) }))
      .filter(e => e.score > THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, COUNT);

    if (ranked.length === 0) {
      console.log(`Round ${round}: nothing above threshold ${THRESHOLD}. Done.`);
      break;
    }

    console.log(`\n--- Round ${round}/${ROUNDS}: rerolling ${ranked.length} texture(s) ---`);
    for (const entry of ranked) {
      const tmp = path.join(tmpDir, entry.job.key.replace(/[/\\]/g, '_') + '.png');
      const res = await generateTo(entry.job, tmp);
      if (res.quota) { console.log(`  QUOTA limit hit — stopping. (${res.error})`); round = ROUNDS + 1; break; }
      if (!res.ok) { console.log(`  skip ${entry.job.key}: ${res.error || 'no image'}`); continue; }
      const next = seamScore(tmp);
      if (next.score < entry.score) {
        fs.copyFileSync(tmp, entry.abs);
        improved++;
        console.log(`  BETTER ${entry.job.key}: ${entry.score} -> ${next.score} (replaced)`);
      } else {
        console.log(`  keep   ${entry.job.key}: ${entry.score} vs ${next.score} (kept existing)`);
      }
      fs.unlinkSync(tmp);
    }
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  const { dest } = writeManifest();
  console.log(`\nReplaced ${improved} texture(s). Manifest refreshed: ${dest}`);
}

main().catch(e => { console.error(e); process.exit(1); });
