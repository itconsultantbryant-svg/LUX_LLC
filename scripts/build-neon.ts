import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const banner =
  "import{createRequire as __luxCreateRequire}from'node:module';import{fileURLToPath as __luxFileURL}from'node:url';import{dirname as __luxDirname}from'node:path';const require=__luxCreateRequire(import.meta.url);const __filename=__luxFileURL(import.meta.url);const __dirname=__luxDirname(__filename);";
for (const [slug, entry] of [
  ["luxapi", "apps/api/src/neon.ts"],
  ["luxworker", "apps/worker/src/neon.ts"],
]) {
  await mkdir(`dist/neon/${slug}`, { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: `dist/neon/${slug}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    banner: { js: banner },
    external: [
      "@nestjs/microservices",
      "@nestjs/microservices/*",
      "@nestjs/websockets",
      "@nestjs/websockets/*",
      "@nestjs/platform-socket.io",
      "@nestjs/platform-ws",
      "class-transformer",
      "class-transformer/*",
      "class-validator",
      "class-validator/*",
      "pg-native",
    ],
    logLevel: "warning",
  });
  console.log("Built Neon function:", slug);
}
