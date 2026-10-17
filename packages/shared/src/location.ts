import { z } from 'zod';

/**
 * Customer location and provider proximity.
 *
 * Location is captured with the customer's explicit permission on sign-in (and
 * refreshed when they move) and is used only to rank verified providers the
 * customer can realistically reach, including emergency care. It is never sold,
 * shared with sponsors, or used for advertising.
 */

export const LOCATION_SIMULATION_LABEL =
  'Location is stored on your account to suggest care you can reach. Sharing is optional and can be cleared anytime.';

export const LocationInputSchema = z
  .object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    accuracyMeters: z.number().gte(0).lte(1_000_000).nullable().optional(),
    label: z.string().trim().min(1).max(120).optional(),
    source: z.enum(['browser', 'manual']).default('browser'),
  })
  .strict();
export type LocationInput = z.infer<typeof LocationInputSchema>;

export const StoredLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number().nullable(),
  label: z.string().nullable(),
  capturedAt: z.string(),
  stale: z.boolean(),
});
export type StoredLocation = z.infer<typeof StoredLocationSchema>;

export const LocationResponseSchema = z.object({
  location: StoredLocationSchema.nullable(),
  simulationLabel: z.string(),
});
export type LocationResponse = z.infer<typeof LocationResponseSchema>;

export const PROVIDER_SERVICES = [
  'emergency',
  'outpatient',
  'maternity',
  'pediatrics',
  'pharmacy',
  'diagnostics',
  'dental',
] as const;
export const ProviderServiceSchema = z.enum(PROVIDER_SERVICES);
export type ProviderService = z.infer<typeof ProviderServiceSchema>;

export const NearbyProviderSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  legalName: z.string(),
  licenseNumber: z.string(),
  addressLine: z.string().nullable(),
  phone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  distanceKm: z.number().nullable(),
  etaMinutes: z.number().nullable(),
  /** True only where the provider is verified for emergency care. */
  emergencyReady: z.boolean(),
  openNow: z.boolean().nullable(),
  services: z.array(z.string()),
  validUntil: z.string().nullable(),
});
export type NearbyProvider = z.infer<typeof NearbyProviderSchema>;

export const NearbyProvidersResponseSchema = z.object({
  providers: z.array(NearbyProviderSchema),
  origin: StoredLocationSchema.nullable(),
  emergency: z.boolean(),
  simulationLabel: z.string(),
});
export type NearbyProvidersResponse = z.infer<typeof NearbyProvidersResponseSchema>;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. Pure and deterministic. */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rough urban travel-time estimate. Uses an average door-to-door speed that is
 * deliberately conservative for the Liberian context so an ETA is never
 * presented as more precise than it is.
 */
export function estimateEtaMinutes(distanceKm: number, averageKph = 24): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  return Math.max(1, Math.round((distanceKm / averageKph) * 60));
}
