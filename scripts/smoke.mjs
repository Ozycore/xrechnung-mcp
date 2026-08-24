#!/usr/bin/env node
// Smoke test for the MCP server without a full MCP client. Spawns
// dist/index.js, writes a JSON-RPC `tools/list` frame + a `tools/call`
// frame for `validate_xrechnung`, reads the responses, exits non-zero
// on failure.
//
// Keeps us honest that the built package actually handshakes on stdio
// and dispatches tools — no need to run Claude Desktop to verify this.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const fixturePath = path.join(repoRoot, "__fixtures__", "valid-xrechnung.xml");
const serverPath = path.join(packageRoot, "dist", "index.js");

const xml = readFileSync(fixturePath, "utf-8");

function frame(obj) {
  return JSON.stringify(obj) + "\n";
}

const requests = [
  frame({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.0.0" },
    },
  }),
  frame({ jsonrpc: "2.0", method: "notifications/initialized" }),
  frame({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  frame({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "validate_xrechnung",
      arguments: { xml },
    },
  }),
];

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "inherit"],
});

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf-8");
});

for (const line of requests) {
  child.stdin.write(line);
}

// Give the server 2 seconds to respond to all four frames, then close.
setTimeout(() => {
  child.stdin.end();
}, 2000);

child.on("close", (code) => {
  const lines = stdout.split("\n").filter(Boolean);
  const responses = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  const toolsList = responses.find((r) => r.id === 1);
  const toolCall = responses.find((r) => r.id === 2);

  let failed = false;

  if (!toolsList?.result?.tools?.length) {
    console.error("FAIL: tools/list did not return tools");
    failed = true;
  } else {
    console.log(
      `OK: tools/list returned ${toolsList.result.tools.length} tools:`,
      toolsList.result.tools.map((t) => t.name).join(", "),
    );
  }

  if (!toolCall?.result?.content?.[0]?.text) {
    console.error("FAIL: tools/call did not return text content");
    failed = true;
  } else {
    try {
      const payload = JSON.parse(toolCall.result.content[0].text);
      console.log(
        `OK: tools/call validate_xrechnung → status=${payload.status}, issues=${payload.issueCount}`,
      );
    } catch (err) {
      console.error(
        "FAIL: tools/call payload was not JSON-parseable:",
        err.message,
      );
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
});
