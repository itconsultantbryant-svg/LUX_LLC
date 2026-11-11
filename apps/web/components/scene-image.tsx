import { scenes, type SceneKey } from "../lib/scenes";
export function SceneImage({
  scene,
  className = "",
  priority = false,
  caption = true,
}: {
  scene: SceneKey;
  className?: string;
  priority?: boolean;
  caption?: boolean;
}) {
  const data = scenes[scene];
  return (
    <figure className={`scene-image ${className}`}>
      <picture>
        <source
          type="image/avif"
          srcSet={[480, 960, 1600]
            .map((w) => `/media/scenes/${scene}-${w}.avif ${w}w`)
            .join(", ")}
          sizes="(max-width: 767px) 100vw, 60vw"
        />
        <img
          src={`/media/scenes/${scene}-960.webp`}
          srcSet={[480, 960, 1600]
            .map((w) => `/media/scenes/${scene}-${w}.webp ${w}w`)
            .join(", ")}
          sizes="(max-width: 767px) 100vw, 60vw"
          alt={data.alt}
          style={{ objectPosition: data.position }}
          width={1536}
          height={1024}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
        />
      </picture>
      {caption && (
        <figcaption>
          <span>{data.category}</span>
          {data.caption}
          <small>
            Photo:{" "}
            <a href={data.source} target="_blank" rel="noopener noreferrer">
              {data.author}
            </a>{" "}
            ·{" "}
            <a href={data.licenseUrl} target="_blank" rel="noopener noreferrer">
              {data.license}
            </a>{" "}
            · Resized/cropped. Context only; no LUX affiliation or endorsement
            implied.
          </small>
        </figcaption>
      )}
    </figure>
  );
}
