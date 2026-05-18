// MCP (Model Context Protocol) server endpoint. Exposes every Jarvis chat
// tool to external MCP clients (Claude Desktop, Cursor, custom integrations)
// over the streamable-HTTP transport: JSON-RPC 2.0 over POST. No SSE; clients
// that only support stateful sessions won't work, but the basic request/reply
// transport is enough for the standard `tools/list` + `tools/call` flow.
//
// Auth: a bearer token in `Authorization: Bearer <MCP_TOKEN>` must match the
// MCP_TOKEN env var. The endpoint refuses every request when MCP_TOKEN is
// unset so the surface is opt-in.

import { NextResponse } from "next/server";
import { z } from "zod";
import { ALL_TOOLS, type ToolName } from "@/lib/chat/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = {
  name: "jarvis",
  version: "0.1.0",
} as const;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1].trim() === expected;
}

type ToolDef = (typeof ALL_TOOLS)[ToolName];

function toolDescription(t: ToolDef): string {
  const desc = (t as { description?: unknown }).description;
  return typeof desc === "string" ? desc : "";
}

function toolInputSchema(t: ToolDef): z.ZodTypeAny | null {
  const schema = (t as { inputSchema?: unknown }).inputSchema;
  return schema && schema instanceof z.ZodType ? schema : null;
}

function toolJsonSchema(t: ToolDef): unknown {
  const schema = toolInputSchema(t);
  if (!schema) return { type: "object", properties: {} };
  try {
    return z.toJSONSchema(schema);
  } catch {
    return { type: "object", properties: {} };
  }
}

async function runTool(
  name: string,
  args: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  if (!(name in ALL_TOOLS)) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }
  const tool = ALL_TOOLS[name as ToolName] as ToolDef;
  const schema = toolInputSchema(tool);
  let input: unknown = args ?? {};
  if (schema) {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
    }
    input = parsed.data;
  }
  const execute = (tool as { execute?: unknown }).execute;
  if (typeof execute !== "function") {
    return { ok: false, error: `Tool ${name} has no execute function.` };
  }
  try {
    const result = await (execute as (i: unknown, ctx?: unknown) => Promise<unknown>)(
      input,
      { toolCallId: cryptoRandomId(), messages: [] },
    );
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

function listToolsResult() {
  const tools = (Object.keys(ALL_TOOLS) as ToolName[]).map((name) => {
    const t = ALL_TOOLS[name] as ToolDef;
    return {
      name,
      description: toolDescription(t),
      inputSchema: toolJsonSchema(t),
    };
  });
  return { tools };
}

async function callToolResult(
  params: { name?: string; arguments?: unknown } | undefined,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }> {
  const name = params?.name;
  if (typeof name !== "string") {
    return {
      content: [{ type: "text", text: "Missing tool name." }],
      isError: true,
    };
  }
  const run = await runTool(name, params?.arguments);
  if (!run.ok) {
    return {
      content: [{ type: "text", text: run.error }],
      isError: true,
    };
  }
  const text =
    typeof run.result === "string"
      ? run.result
      : JSON.stringify(run.result, null, 2);
  return {
    content: [{ type: "text", text }],
    isError: false,
  };
}

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  switch (req.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, listToolsResult());
    case "tools/call": {
      const params = req.params as { name?: string; arguments?: unknown };
      const result = await callToolResult(params);
      return ok(id, result);
    }
    case "notifications/initialized":
      // Notifications have no id and expect no response. Returning null here
      // signals "send 202 with empty body" below.
      return null;
    default:
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(err(null, -32700, "Parse error"), { status: 400 });
  }

  const requests: JsonRpcRequest[] = Array.isArray(body)
    ? (body as JsonRpcRequest[])
    : [body as JsonRpcRequest];

  const responses: JsonRpcResponse[] = [];
  for (const r of requests) {
    if (!r || typeof r !== "object" || r.jsonrpc !== "2.0" || typeof r.method !== "string") {
      responses.push(err(null, -32600, "Invalid Request"));
      continue;
    }
    const resp = await dispatch(r);
    if (resp) responses.push(resp);
  }

  if (responses.length === 0) {
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(Array.isArray(body) ? responses : responses[0]);
}

export async function GET() {
  return NextResponse.json({
    server: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http (POST only)",
    auth: process.env.MCP_TOKEN ? "enabled" : "disabled — set MCP_TOKEN to enable",
  });
}
