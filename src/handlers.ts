// Runtime handlers for the MCP tools. Each handler takes already-validated
// arguments (JSON-Schema checked by the SDK dispatcher) and returns an
// MCP `content` array suitable for a tool-call response.
//
// All handlers are synchronous-style — they never touch the network or
// the filesystem — so errors come from exceptions in the core package.
// We catch and wrap those into isError responses rather than letting
// the MCP SDK surface a protocol-level error.

import {
  extractXmlFromPdfBase64,
  parseInvoiceXml,
  validateInvoiceData,
} from "@e-rechnung-inbox/xrechnung-core";

type TextContent = { type: "text"; text: string };
type ToolResult = {
  content: TextContent[];
  isError?: boolean;
};

function ok(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function fail(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function handleValidateXRechnung(args: unknown): ToolResult {
  const xml = readStringArg(args, "xml");
  if (!xml) {
    return fail("validate_xrechnung: `xml` must be a non-empty string.");
  }

  try {
    const { parsed, lineItems } = parseInvoiceXml(xml);
    const format =
      xml.toLowerCase().includes("zugferd") ||
      xml.toLowerCase().includes("factur-x")
        ? "zugferd"
        : "xrechnung";
    const { issues, validationStatus, validationScore } = validateInvoiceData(
      parsed,
      lineItems,
      format,
    );

    return ok({
      status: validationStatus,
      score: validationScore,
      issueCount: issues.length,
      issues,
      parsed: {
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        senderName: parsed.senderName,
        buyerName: parsed.buyerName,
        currency: parsed.currency,
        grossAmount: parsed.grossAmount,
        customizationId: parsed.customizationId,
        specificationId: parsed.specificationId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`validate_xrechnung failed: ${message}`);
  }
}

export function handleParseInvoice(args: unknown): ToolResult {
  const xml = readStringArg(args, "xml");
  if (!xml) {
    return fail("parse_invoice: `xml` must be a non-empty string.");
  }

  try {
    const { parsed, lineItems } = parseInvoiceXml(xml);
    return ok({ parsed, lineItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`parse_invoice failed: ${message}`);
  }
}

export function handleExtractZugferd(args: unknown): ToolResult {
  const pdfBase64 = readStringArg(args, "pdfBase64");
  if (!pdfBase64) {
    return fail("extract_zugferd: `pdfBase64` must be a non-empty string.");
  }

  try {
    const xml = extractXmlFromPdfBase64(pdfBase64);
    if (!xml) {
      return ok({
        found: false,
        xml: "",
        note: "No embedded XML detected. The PDF may not be ZUGFeRD/Factur-X, or the XML stream is compressed (the simple scanner does not decompress Flate streams).",
      });
    }
    return ok({ found: true, xml });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`extract_zugferd failed: ${message}`);
  }
}

function readStringArg(args: unknown, key: string): string | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const value = (args as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
