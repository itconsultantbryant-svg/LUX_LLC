import { team } from "../../../packages/config/team";

export { team };

export async function publicData(path: string) {
  try {
    const res = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/v1/public/${path}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (res.ok) return await res.json();
  } catch {}
  return null;
}
