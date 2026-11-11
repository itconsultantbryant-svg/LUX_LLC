import { buildApplication } from "./app.ts";
import { mode } from "./auth.ts";
const app = await buildApplication();
await app.listen(Number(process.env.PORT || 4000), "0.0.0.0");
console.log(`LUX API ready; mode=${mode}`);
