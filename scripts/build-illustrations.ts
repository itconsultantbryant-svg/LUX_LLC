import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

type Entry = {
  key: string;
  suppliedAs: string;
  source: string;
  sha256: string;
  crop: { left: number; top: number; width: number; height: number } | null;
  widths: number[];
  alt: string;
  title: string;
  usage: string;
  disclosure: string;
};

const manifest = JSON.parse(
  await readFile("assets/illustrations/manifest.json", "utf8"),
) as { note: string; images: Entry[] };

const out = "apps/web/public/media/illustrations";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const published = [];
for (const image of manifest.images) {
  const original = await readFile(image.source);
  const digest = createHash("sha256").update(original).digest("hex");
  if (digest !== image.sha256)
    throw Error(`Supplied image hash mismatch: ${image.key}`);

  let pipeline = sharp(original).rotate();
  if (image.crop) pipeline = pipeline.extract(image.crop);

  const metadata = await pipeline.metadata();
  const maxWidth = metadata.width || image.widths.at(-1)!;

  for (const width of image.widths) {
    if (width > maxWidth) throw Error(`Width ${width} exceeds ${image.key}`);
    for (const format of ["avif", "webp", "jpeg"] as const) {
      const extension = format === "jpeg" ? "jpg" : format;
      const file = `${out}/${image.key}-${width}.${extension}`;
      await pipeline
        .clone()
        .resize({ width, withoutEnlargement: true })
        .toFormat(format, {
          quality: format === "avif" ? 58 : format === "webp" ? 82 : 84,
          ...(format === "jpeg" ? { mozjpeg: true } : {}),
        })
        .toFile(file)
        .catch(async (error) => {
          throw new Error(
            `${error instanceof Error ? error.message : error}: ${file}`,
          );
        });
    }
  }

  published.push({
    key: image.key,
    suppliedAs: image.suppliedAs,
    sha256: image.sha256,
    crop: image.crop,
    widths: image.widths,
    alt: image.alt,
    title: image.title,
    usage: image.usage,
    disclosure: image.disclosure,
  });
}

await writeFile(
  `${out}/credits.json`,
  JSON.stringify(
    {
      note: manifest.note,
      images: published,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `Built ${published.length} illustrative image sets with public provenance.`,
);
