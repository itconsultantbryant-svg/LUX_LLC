import type pg from 'pg';
import {
  estimateEtaMinutes,
  haversineKm,
  type LocationInput,
  type NearbyProvider,
  type StoredLocation,
} from '@healthwallet/shared';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 8;

type LocationRow = {
  latitude: string;
  longitude: string;
  accuracy_meters: number | null;
  label: string | null;
  captured_at: Date;
};

type ProviderRow = {
  id: string;
  organization_id: string;
  legal_name: string;
  license_number: string;
  address: { line?: string; phone?: string } | null;
  latitude: string | null;
  longitude: string | null;
  emergency_ready: boolean;
  services: string[] | null;
  valid_until: Date | null;
};

function toStored(row: LocationRow): StoredLocation {
  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracy_meters,
    label: row.label,
    capturedAt: row.captured_at.toISOString(),
    stale: Date.now() - row.captured_at.getTime() > STALE_AFTER_MS,
  };
}

export async function getLocation(
  client: pg.PoolClient,
  userId: string,
): Promise<StoredLocation | null> {
  const row = (
    await client.query<LocationRow>(
      'SELECT latitude,longitude,accuracy_meters,label,captured_at FROM customer_locations WHERE user_id=$1',
      [userId],
    )
  ).rows[0];
  return row ? toStored(row) : null;
}

export async function upsertLocation(
  client: pg.PoolClient,
  userId: string,
  input: LocationInput,
): Promise<StoredLocation> {
  const row = (
    await client.query<LocationRow>(
      `INSERT INTO customer_locations(user_id,latitude,longitude,accuracy_meters,label,source,captured_at)
       VALUES($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT(user_id) DO UPDATE SET latitude=$2,longitude=$3,accuracy_meters=$4,label=$5,source=$6,captured_at=now()
       RETURNING latitude,longitude,accuracy_meters,label,captured_at`,
      [
        userId,
        input.latitude,
        input.longitude,
        input.accuracyMeters ?? null,
        input.label ?? null,
        input.source,
      ],
    )
  ).rows[0];
  return toStored(row);
}

export async function clearLocation(client: pg.PoolClient, userId: string): Promise<void> {
  await client.query('DELETE FROM customer_locations WHERE user_id=$1', [userId]);
}

/**
 * Verified providers, nearest first when the customer has shared a location.
 * Only providers whose latest verification passed registry checks are returned.
 */
export async function nearbyProviders(
  client: pg.PoolClient,
  origin: StoredLocation | null,
  opts: { emergency?: boolean; limit?: number } = {},
): Promise<NearbyProvider[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 50);
  const rows = (
    await client.query<ProviderRow>(
      `SELECT p.id,p.organization_id,p.legal_name,p.license_number,p.address,p.latitude,p.longitude,p.emergency_ready,p.services,v.valid_until
       FROM providers p
       JOIN organizations o ON o.id=p.organization_id
       JOIN LATERAL (SELECT * FROM provider_verification_records WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) v ON true
       WHERE p.status='verified' AND o.status='approved' AND v.status='verified' AND v.method='registry_check' AND v.valid_until>now()
         AND v.verified_details=jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address)
         AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
         ${opts.emergency ? 'AND p.emergency_ready=true' : ''}
       LIMIT 500`,
    )
  ).rows;

  const mapped: NearbyProvider[] = rows.map((row) => {
    const latitude = row.latitude != null ? Number(row.latitude) : null;
    const longitude = row.longitude != null ? Number(row.longitude) : null;
    const distanceKm =
      origin && latitude != null && longitude != null
        ? haversineKm(
            { latitude: origin.latitude, longitude: origin.longitude },
            { latitude, longitude },
          )
        : null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      legalName: row.legal_name,
      licenseNumber: row.license_number,
      addressLine: row.address?.line ?? null,
      phone: row.address?.phone ?? null,
      latitude,
      longitude,
      distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(1)),
      etaMinutes: distanceKm == null ? null : estimateEtaMinutes(distanceKm),
      emergencyReady: Boolean(row.emergency_ready),
      openNow: null,
      services: row.services ?? [],
      validUntil: row.valid_until ? row.valid_until.toISOString() : null,
    };
  });

  if (origin) mapped.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  else mapped.sort((a, b) => a.legalName.localeCompare(b.legalName));

  return mapped.slice(0, limit);
}
