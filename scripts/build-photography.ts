import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
// Originals and provenance are checked in. This never generates or synthesizes people.
const manifest = JSON.parse(
  await readFile("assets/photography/manifest.json", "utf8"),
);
await mkdir("apps/web/public/media/scenes", { recursive: true });
for (const photo of manifest) {
  const original = await readFile(photo.original);
  if (createHash("sha256").update(original).digest("hex") !== photo.sha256)
    throw Error(`Original hash mismatch: ${photo.key}`);
  for (const width of [480, 960, 1600]) {
    // Preserve composition; layout crops are disclosed in the credits.
    for (const format of ["webp", "avif"] as const)
      await sharp(original)
        .rotate()
        .resize({ width })
        .toFormat(format, { quality: format === "webp" ? 85 : 62 })
        .toFile(`apps/web/public/media/scenes/${photo.key}-${width}.${format}`);
  }
}
await writeFile(
  "apps/web/public/media/scenes/credits.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Built ${manifest.length} real-photo scene sets with public provenance.`,
);
