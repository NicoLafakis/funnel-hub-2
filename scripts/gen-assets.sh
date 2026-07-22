#!/bin/bash
# HubHole art batch — regenerates all still image assets via Leonardo AI.
# Usage: bash scripts/gen-assets.sh   (needs .leonardo-key or LEONARDO_API_KEY)
cd "$(dirname "$0")/.." || exit 1
G="node scripts/leonardo.js gen"
M="lucid"
ICON=", centered icon on a deep dark navy circular badge, bold clean vector game art style, high contrast, no text"

mkdir -p assets/hubs

$G "Game item sprite: a single gleaming golden vinyl record disc with a bright star sparkle in the center, glossy premium cartoon game art, rich gold and amber palette, centered on solid dark navy background, no text" 768 768 assets/golden-record.png "$M"
$G "Game emblem: a menacing cartoon black hole face with glowing red and purple swirl rings and angry yellow eyes, centered on a dark circular badge, bold clean vector game art style, no text" 768 768 assets/rival-emblem.png "$M"
$G "Sad cartoon scene: a tiny cute floppy disk character watching papers and envelopes fly away into the sky, deep navy background, melancholic but adorable game art style, no text" 1024 1024 assets/fail-art.png "$M"
$G "Wide game promotional banner: cartoon black hole vortex on the right side swirling with floating office objects, envelopes, smartphones and dollar bills, deep navy space background with empty copy space on the left, vibrant orange and teal accents, game key art, no text" 1344 768 assets/og-card.png "$M"

$G "Glossy cartoon address book with a person silhouette$ICON" 768 768 assets/hubs/hub-1.png "$M"
$G "Glossy cartoon megaphone with a flying envelope$ICON" 768 768 assets/hubs/hub-2.png "$M"
$G "Glossy cartoon golden trophy with a dollar sign$ICON" 768 768 assets/hubs/hub-3.png "$M"
$G "Glossy cartoon life ring with a smiling support ticket$ICON" 768 768 assets/hubs/hub-4.png "$M"
$G "Glossy cartoon newspaper with a play button$ICON" 768 768 assets/hubs/hub-5.png "$M"
$G "Glossy cartoon gear with circular sync arrows$ICON" 768 768 assets/hubs/hub-6.png "$M"
$G "Glossy cartoon bank building with a credit card$ICON" 768 768 assets/hubs/hub-7.png "$M"
$G "Glossy cartoon computer monitor with a bar chart$ICON" 768 768 assets/hubs/hub-8.png "$M"
$G "Glossy cartoon robot head with a lightning bolt$ICON" 768 768 assets/hubs/hub-9.png "$M"
$G "Glossy cartoon glowing AI brain with sparkles$ICON" 768 768 assets/hubs/hub-10.png "$M"

echo "ALL ASSETS DONE"
ls -la assets/ assets/hubs/
