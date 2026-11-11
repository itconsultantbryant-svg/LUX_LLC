import "dotenv/config";
import { tick } from "./jobs.ts";
import { pool } from "../../../packages/db/index.ts";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
console.log("LUX durable PostgreSQL worker started");
while (!stopping) {
  try {
    if (!(await tick())) await new Promise((r) => setTimeout(r, 1000));
  } catch {
    console.error(
      "Worker database unavailable; retrying without dropping durable work",
    );
    await new Promise((r) => setTimeout(r, 5000));
  }
}
await pool.end();
