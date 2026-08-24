#!/usr/bin/env node
// @e-rechnung-inbox/xrechnung-mcp
//
// MCP server exposing XRechnung/ZUGFeRD/Factur-X validation and parsing
// tools over stdio. Designed to run via `npx -y @e-rechnung-inbox/xrechnung-mcp`
// from an MCP-capable client (Claude Desktop, Cursor, etc.).
//
// No configuration, no API key, no network. All three tools (validate,
// parse, extract) are pure functions over the input bytes. The server
// stays quiet until asked something.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  handleExtractZugferd,
  handleParseInvoice,
  handleValidateXRechnung,
} from "./handlers.js";
import { tools } from "./tools.js";

const PACKAGE_NAME = "@e-rechnung-inbox/xrechnung-mcp";
const PACKAGE_VERSION = "0.1.0";

async function main(): Promise<void> {
  const server = new Server(
    {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "validate_xrechnung":
        return handleValidateXRechnung(args);
      case "parse_invoice":
        return handleParseInvoice(args);
      case "extract_zugferd":
        return handleExtractZugferd(args);
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // Never log to stdout: stdio MCP transport uses stdout for the protocol.
  // All server-side diagnostics belong on stderr.
  console.error(`[${PACKAGE_NAME}] fatal:`, error);
  process.exit(1);
});
