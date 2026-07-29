// Thin CLI wrapper for calling a single PixelLab MCP tool.
// Usage: node scripts/pixellab-mcp.js <toolName> '<jsonArgs>'
// API key: env PIXELLAB_API_KEY, or a .pixellab-key file in the repo root (gitignored).
const { callTool } = require('./pixellab');

async function main() {
  const toolName = process.argv[2];
  if (!toolName) {
    console.error("Usage: node scripts/pixellab-mcp.js <toolName> '<jsonArgs>'");
    process.exit(1);
  }
  const toolArgs = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  const result = await callTool(toolName, toolArgs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
