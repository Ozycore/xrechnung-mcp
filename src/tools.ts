// MCP tool schema definitions for @e-rechnung-inbox/xrechnung-mcp v0.1.
//
// Three tools ship in v0.1:
//   - validate_xrechnung(xml)       → structural validation report
//   - parse_invoice(xml)            → normalized invoice + line items
//   - extract_zugferd(pdfBase64)    → embedded Factur-X XML string
//
// All inputs are plain strings, all outputs are JSON-serializable. No auth,
// no state, no network I/O — the server is trivial to sandbox.

export const tools = [
  {
    name: "validate_xrechnung",
    description:
      "Validate an XRechnung or ZUGFeRD/Factur-X XML document against the EN 16931 core model. Returns a structured report with severity-graded issues. Stateless, offline.",
    inputSchema: {
      type: "object",
      properties: {
        xml: {
          type: "string",
          description:
            "The XRechnung/ZUGFeRD invoice XML. UBL or UN/CEFACT CII flavors both accepted. Must be a non-empty string.",
        },
      },
      required: ["xml"],
      additionalProperties: false,
    },
  },
  {
    name: "parse_invoice",
    description:
      "Parse an XRechnung or ZUGFeRD/Factur-X XML document into a normalized invoice structure with header, totals, line items, and tax breakdown. Useful for extracting invoice data without the full validation cycle.",
    inputSchema: {
      type: "object",
      properties: {
        xml: {
          type: "string",
          description:
            "The XRechnung/ZUGFeRD invoice XML. UBL or UN/CEFACT CII flavors both accepted.",
        },
      },
      required: ["xml"],
      additionalProperties: false,
    },
  },
  {
    name: "extract_zugferd",
    description:
      "Extract the embedded Factur-X XML from a ZUGFeRD PDF. Input is the PDF content as a base64-encoded string. Returns the embedded XML as a UTF-8 string, or an empty string if no XML is found.",
    inputSchema: {
      type: "object",
      properties: {
        pdfBase64: {
          type: "string",
          description:
            "Base64-encoded ZUGFeRD (Factur-X) PDF bytes. Whitespace in the base64 string is tolerated.",
        },
      },
      required: ["pdfBase64"],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof tools)[number]["name"];
