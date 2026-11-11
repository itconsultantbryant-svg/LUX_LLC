import { attachDatabasePool } from "@neon/functions";
import { pool } from "../../../packages/db/index.ts";
import {
  ApiController,
  originAllowed,
  blockedAuthPath,
  type ApiRequest,
  type ApiResponse,
} from "./app.ts";
import { auth } from "./auth.ts";
attachDatabasePool(pool);
const controller = new ApiController();
async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1048576)
    throw Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 1048576) {
      await reader.cancel();
      throw Error("BODY_TOO_LARGE");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
export default {
  async fetch(request: Request): Promise<Response> {
    const correlationId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      if (!originAllowed(request.method, request.headers.get("origin")))
        return secure(
          Response.json(
            {
              code: "ORIGIN_REJECTED",
              message: "Origin not permitted",
              correlationId,
            },
            { status: 403 },
          ),
        );
      const raw = ["GET", "HEAD"].includes(request.method)
        ? ""
        : await boundedBody(request);
      if (url.pathname.startsWith("/api/auth/")) {
        if (blockedAuthPath(url.pathname))
          return secure(
            Response.json(
              {
                code: "INVITATION_REQUIRED",
                message: "Account creation is invitation-only.",
                correlationId,
              },
              { status: 403 },
            ),
          );
        const forwarded = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          ...(raw ? { body: raw } : {}),
        });
        return secure(await auth.handler(forwarded));
      }
      if (!url.pathname.startsWith("/api/v1/"))
        return secure(
          Response.json(
            {
              code: "ROUTE_NOT_FOUND",
              message: "Route not found",
              correlationId,
            },
            { status: 404 },
          ),
        );
      let body: any = {};
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          return secure(
            Response.json(
              {
                code: "INVALID_REQUEST_BODY",
                message: "Use a valid JSON request.",
                correlationId,
                fieldErrors: {},
              },
              { status: 400 },
            ),
          );
        }
      }
      const headers = new Headers();
      let status = 200,
        result: BodyInit | null = null;
      const response: ApiResponse = {
        setHeader: (k, v) => headers.set(k, v),
        status(code) {
          status = code;
          return this;
        },
        json(value) {
          headers.set("Content-Type", "application/json");
          result = JSON.stringify(value);
          return this;
        },
        type(type) {
          headers.set(
            "Content-Type",
            type === "text/csv" ? "text/csv; charset=utf-8" : type,
          );
          return this;
        },
        attachment(name) {
          headers.set(
            "Content-Disposition",
            `attachment; filename="${name.replace(/["\r\n]/g, "")}"`,
          );
          return this;
        },
        send(value) {
          result = value;
          return this;
        },
      };
      const req: ApiRequest = {
        path: url.pathname,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        header: (name) => request.headers.get(name) || undefined,
        ip: request.headers.get("x-neon-client-ip") || "neon-ingress",
        query: Object.fromEntries(url.searchParams),
        body,
      };
      await controller.handle(req, response);
      return secure(new Response(result, { status, headers }));
    } catch (error) {
      return secure(
        Response.json(
          {
            code:
              error instanceof Error && error.message === "BODY_TOO_LARGE"
                ? "BODY_TOO_LARGE"
                : "REQUEST_UNAVAILABLE",
            message: "The request could not be processed safely.",
            fieldErrors: {},
            correlationId,
          },
          {
            status:
              error instanceof Error && error.message === "BODY_TOO_LARGE"
                ? 413
                : 503,
          },
        ),
      );
    }
  },
};
