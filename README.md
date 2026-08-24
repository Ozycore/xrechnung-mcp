> **Source mirror.** This repository mirrors the published npm package
> [`@e-rechnung-inbox/xrechnung-mcp`](https://www.npmjs.com/package/@e-rechnung-inbox/xrechnung-mcp).
> Development happens in the (private) e-Rechnung Inbox monorepo; a
> scheduled workflow keeps this mirror in sync with the npm release.
> Issues are closed here — reach us via https://www.e-rechnung-inbox.de.

# @e-rechnung-inbox/xrechnung-mcp

Model Context Protocol (MCP) server for validating and parsing German
e-invoices — **XRechnung**, **ZUGFeRD**, and **Factur-X**.

Stateless. Offline. No API key. Pure local computation over bytes you
paste in. Runs via `npx`, so there's nothing to install permanently.

Built by [e-Rechnung Inbox](https://www.e-rechnung-inbox.de) — DACH
compliance infrastructure for German e-invoicing (XRechnung
Empfangspflicht eff. 2025-01-01). Used in production by
Steuerberater and SMB developers who need an offline, no-API-key
path to validate, parse, and archive inbound e-invoices.

## Install (Claude Desktop)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent `%APPDATA%\Claude\claude_desktop_config.json`
on Windows, and add:

```json
{
  "mcpServers": {
    "xrechnung": {
      "command": "npx",
      "args": ["-y", "@e-rechnung-inbox/xrechnung-mcp"]
    }
  }
}
```

Restart Claude Desktop. The three tools (`validate_xrechnung`,
`parse_invoice`, `extract_zugferd`) will show up in any new conversation.

## Install (Cursor / generic MCP)

```bash
npx -y @e-rechnung-inbox/xrechnung-mcp
```

The server speaks MCP over stdio. Point any MCP-capable client at it.

## Tools

### `validate_xrechnung(xml)`

Structural validation of an XRechnung or ZUGFeRD/Factur-X XML
document against the EN 16931 European e-invoice core model.

**Input**

```json
{ "xml": "<Invoice>...</Invoice>" }
```

**Output** (abridged)

```json
{
  "status": "valid" | "warning" | "invalid",
  "score": 95,
  "issueCount": 0,
  "issues": [],
  "parsed": {
    "invoiceNumber": "RE-2026-0042",
    "invoiceDate": "2026-04-23",
    "senderName": "Example GmbH",
    "grossAmount": 1190.00,
    "currency": "EUR",
    "customizationId": "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0",
    "specificationId": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
  }
}
```

This is the TS+Zod validator we ship in production at
e-rechnung-inbox.de. It covers the structural/core-model layer.
For reference-implementation parity you'd pair it with the
[KoSIT Java validator](https://github.com/itplr-kosit/validator)
(that's a Stage 2 deployment decision for us — see ADR-013 in the
main repo).

### `parse_invoice(xml)`

Parse XRechnung/ZUGFeRD XML into a normalized invoice structure
with header fields, totals, line items, and tax breakdown. Useful
for data extraction without going through the full validation cycle.

**Input**

```json
{ "xml": "<Invoice>...</Invoice>" }
```

**Output** (abridged)

```json
{
  "parsed": {
    "invoiceNumber": "RE-2026-0042",
    "invoiceDate": "2026-04-23",
    "dueDate": "2026-05-23",
    "senderName": "Example GmbH",
    "senderVatId": "DE123456789",
    "buyerName": "Acme AG",
    "netAmount": 1000,
    "taxAmount": 190,
    "grossAmount": 1190,
    "currency": "EUR",
    "iban": "DE89370400440532013000",
    "taxBreakdown": [{ "taxRate": 19, "taxableAmount": 1000, "taxAmount": 190 }]
  },
  "lineItems": [
    { "description": "Consulting", "quantity": 10, "unitPrice": 100, "taxRate": 19, "lineTotal": 1000 }
  ]
}
```

### `extract_zugferd(pdfBase64)`

Extract the embedded Factur-X XML from a ZUGFeRD PDF.

**Input**

```json
{ "pdfBase64": "JVBERi0xLjQKJcfsj6IK..." }
```

**Output**

```json
{
  "found": true,
  "xml": "<Invoice>...</Invoice>"
}
```

If no embedded XML is found (not a ZUGFeRD PDF, or XML stream is
Flate-compressed), the tool returns `found: false` and a short note.
The v0.1 extractor is a simple substring scanner — it covers roughly
95% of real-world Factur-X PDFs. A proper PDF walker ships in v0.2.

## Hosted MCP v0.2 (Public API surface)

A hosted JSON-RPC endpoint is available in the main app at
`/api/public/v1/mcp`. It is separate from this local stdio package and uses the
same Public API key authentication plus tier-aware rate limits as
`/api/public/v1/*` REST routes.

Current hosted scope is deliberately narrow:

- `tools/list`
- `tools/call` with `validate_xrechnung`
- `tools/call` with `parse_xrechnung`

Usage is written to the metadata-only `api_usage_events` shadow ledger with
`surface='mcp'`. Stripe usage dispatch is disabled by default and must remain
off until issuer/legal billing gates close.

Example hosted call:

```bash
curl https://www.e-rechnung-inbox.de/api/public/v1/mcp \
  -H "Authorization: Bearer ERI_SAMPLE_VALUE" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

The hosted endpoint currently performs the same TS+Zod structural/core-model
validation as this package. Public copy must stay certification-safe; do not
claim official certification. Use "Mit offiziellem KoSIT-Validator geprüft"
only for product flows backed by the paired KoSIT validator result.

## Usage examples

Once the server is configured, you can ask Claude things like:

- *"Here's an XRechnung XML — is it valid?"* → Claude calls
  `validate_xrechnung` and reports status + issue details.
- *"Pull the sender, buyer, and total from this invoice."* → Claude
  calls `parse_invoice` and answers from the structured output.
- *"What's inside this ZUGFeRD PDF?"* → Claude reads the file,
  base64-encodes it, calls `extract_zugferd`, then
  `validate_xrechnung` / `parse_invoice` on the result.

## What this does NOT do

- **No KoSIT reference validation.** Running the official Java
  KoSIT validator requires a JVM; that's out of scope for a local
  stdio MCP server. For KoSIT parity we run a paired Fly.io-hosted
  daemon in the main product.
- **No network calls.** Purely local computation. Your XML never
  leaves your machine.
- **No signature / PAdES verification.** `.p7s` signed invoice
  envelopes will be handled in v0.2.
- **No EN 16931 conformance "offiziell KoSIT-konform" claim.**
  This server does *structural* validation. For a
  "KoSIT-validated" assertion you need the KoSIT daemon output.

## Roadmap

- **Hosted v0.2**: `/api/public/v1/mcp` JSON-RPC endpoint with API key auth,
  tier-aware rate limits, `validate_xrechnung`, `parse_xrechnung`, and
  metadata-only usage metering is implemented in the main app.
- **Local stdio v0.2**: proper ZUGFeRD PDF walker and PAdES signature
  validation.
- **v1.0 commercial scaffold (not active):** the hosted surface has a
  repo-local decision/readiness helper for future commercial tiers
  (`src/lib/api/mcp/commercial-tier.ts`). It is guarded by
  `MCP_COMMERCIAL_TIER_ENABLED=false` and does not create Stripe products,
  submit registry listings, or change this local stdio package.
- **v1.0 future candidate:** optional paired KoSIT call via our Fly.io daemon
  (requires API key), once product/legal copy remains certification-safe and
  metered billing is allowed to leave shadow mode.

## Example conversation

Once configured, a typical interaction in Claude Desktop looks like:

> **You:** Validate this XRechnung XML and tell me if it's compliant.
> *(paste XML)*
>
> **Claude:** *(calls `validate_xrechnung`)* The XML is structurally
> valid against EN 16931 + KoSIT business rules. Vendor: ACME GmbH,
> total €1,234.50, due 2026-05-15. No findings.

> **You:** Extract the line items so I can paste them into our ERP.
>
> **Claude:** *(calls `parse_invoice`)* 3 line items extracted with
> tax breakdown ready to import.

> **You:** Generate a DATEV CSV for this and the previous five invoices.
>
> **Claude:** *(combines `parse_invoice` outputs and proposes a CSV)*
> Here's the CP1252-encoded CSV...

The server is stateless — each tool call gets the XML you paste; nothing
is stored between turns.

## Source

Source lives in the [e-rechnung-inbox monorepo](https://github.com/imysfylmz/e-rechnung-inbox)
under `packages/xrechnung-mcp`. The underlying parser/validator lives
alongside in `@e-rechnung-inbox/xrechnung-core`, also on npm, if you
want to use the logic directly without MCP.

## License

MIT.

---

*Built by [e-Rechnung Inbox](https://www.e-rechnung-inbox.de) — DACH
compliance infrastructure.*
