// Download the completed PixelLab assets submitted by scripts/generate-art-batch.js.
// Handles tiles (storage URL) and images (inline base64 or storage URL), and
// verifies every file really is a PNG before declaring it done.
// API key: env PIXELLAB_API_KEY, or a .pixellab-key file in the repo root (gitignored).
const fs = require('fs');
const path = require('path');
const {
  ROOT, callTool, extractText, extractInlineImage, extractUrls,
  downloadFile, isValidPng, writeBase64Png, sleep,
} = require('./pixellab');

const TEXTURES_DIR = path.join(ROOT, 'assets', 'textures');

async function main() {
  if (!fs.existsSync(TEXTURES_DIR)) fs.mkdirSync(TEXTURES_DIR, { recursive: true });

  const jobs = [
    // Ground tiles
    { id: '8af6a00c-1add-4b29-9f37-6bc9f6f43736', type: 'tile', name: 'asphalt', filename: 'ground-asphalt.png' },
    { id: '4d140c3e-1693-4c9a-a9b4-694b1afcd0fd', type: 'tile', name: 'sidewalk', filename: 'ground-sidewalk.png' },
    { id: '55a336ca-0af3-43aa-9c46-87e57750bb5a', type: 'tile', name: 'grass', filename: 'ground-grass.png' },
    { id: '50389902-b5fa-49b9-b79a-f2692d53f1ae', type: 'tile', name: 'parking', filename: 'ground-parking.png' },
    // Facade Pro images
    { id: 'f9cd6d47-e39a-476c-b0e8-4d247c3203b1', type: 'image', name: 'facade_apartment', filename: 'facade-apartment-v3.png' },
    { id: '90f973c2-d320-4cbf-a499-c7ad7c745493', type: 'image', name: 'facade_office', filename: 'facade-office-v3.png' },
    { id: '80caeb13-eb94-4e8f-b55b-2965d6e1fe59', type: 'image', name: 'facade_concrete', filename: 'facade-concrete-v2.png' },
    { id: '6ec63601-c07a-46bc-a00b-f426532261bb', type: 'image', name: 'facade_storefront', filename: 'facade-storefront.png' },
  ];

  // Resumable: anything already on disk as a valid PNG needs no API call.
  for (const job of jobs) {
    if (isValidPng(path.join(TEXTURES_DIR, job.filename))) {
      job.done = true;
      console.log(`  = ${job.name}: already downloaded`);
    }
  }

  const maxAttempts = 40;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = jobs.filter(j => !j.done);
    if (remaining.length === 0) break;

    console.log(`\n--- Attempt ${attempt}/${maxAttempts} (${remaining.length} remaining) ---`);

    for (const job of remaining) {
      const toolName = job.type === 'tile' ? 'get_tiles_pro' : 'get_image';
      const argKey = job.type === 'tile' ? 'tile_id' : 'job_id';

      const result = await callTool(toolName, { [argKey]: job.id });
      const text = extractText(result);
      const dest = path.join(TEXTURES_DIR, job.filename);

      if (/processing|queued/i.test(text)) {
        console.log(`  ... ${job.name}: still processing`);
        continue;
      }

      const inline = extractInlineImage(result);
      if (inline) {
        if (writeBase64Png(inline.data, dest)) {
          console.log(`  OK ${job.name}: saved inline image -> ${dest}`);
          job.done = true;
        } else {
          console.log(`  !! ${job.name}: inline data was not a valid PNG, will retry`);
        }
        continue;
      }

      const urls = extractUrls(text);
      if (urls.length > 0) {
        const url = urls.find(u => /backblaze|storage/.test(u)) || urls[0];
        console.log(`  -> ${job.name}: downloading ${url.slice(0, 80)}...`);
        try {
          const bytes = await downloadFile(url, dest);
          if (isValidPng(dest)) {
            console.log(`     saved ${dest} (${bytes} bytes)`);
            job.done = true;
          } else {
            fs.unlinkSync(dest);
            console.log('     downloaded file was not a valid PNG, deleted; will retry');
          }
        } catch (e) {
          console.log(`     download error: ${e.message}`);
        }
        continue;
      }

      console.log(`  ? ${job.name}: ${text.slice(0, 200)}`);
      await sleep(300);
    }

    if (jobs.some(j => !j.done)) {
      console.log('\nWaiting 15s...');
      await sleep(15000);
    }
  }

  console.log('\n=== FINAL STATUS ===');
  const done = jobs.filter(j => j.done);
  const pending = jobs.filter(j => !j.done);
  console.log(`Downloaded: ${done.length}/${jobs.length}`);
  done.forEach(j => console.log(`  OK ${j.name} -> ${j.filename}`));
  pending.forEach(j => console.log(`  PENDING ${j.name} (${j.id})`));
}

main().catch(e => { console.error(e); process.exit(1); });
