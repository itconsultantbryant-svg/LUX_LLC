import { attachDatabasePool } from "@neon/functions";
import { timingSafeEqual } from "node:crypto";
import { pool } from "../../../packages/db/index.ts";
import { tick } from "./jobs.ts";
attachDatabasePool(pool);
export default {
  async fetch(request: Request) {
    if (request.method !== "POST")
      return Response.json({ code: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const provided = request.headers.get("authorization") || "",
      expected = "Bearer " + (process.env.WORKER_TRIGGER_SECRET || "");
    const manualAllowed =
      !!process.env.WORKER_TRIGGER_SECRET &&
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    // Neon strips client-supplied X-Neon-* headers at its ingress. This header is
    // accepted only in the explicitly deployed Neon adapter, never the public API.
    const scheduled =
      process.env.LUX_NEON_RUNTIME === "true" &&
      !!request.headers.get("x-neon-trigger-invocation-id");
    if (!scheduled && !manualAllowed)
      return Response.json(
        { code: "WORKER_AUTHENTICATION_REQUIRED" },
        { status: 401 },
      );
    let count = 0;
    const deadline = Date.now() + 20000;
    while (count < 50 && Date.now() < deadline && (await tick())) count++;
    console.log(
      JSON.stringify({
        event: "durable_jobs_batch",
        processed: count,
        scheduled,
      }),
    );
    return Response.json({ processed: count });
  },
};
