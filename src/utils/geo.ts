export interface GeoCoords {
  lat: number;
  lon: number;
}

// Zamek Piastowski w Raciborzu
export const RACIBORZ_CASTLE_COORDS: GeoCoords = {
  lat: 50.0956,
  lon: 18.2219,
};

// Domyślne współrzędne startowe (Gliwice) w razie braku zgody na GPS
export const GLIWICE_FALLBACK_COORDS: GeoCoords = {
  lat: 50.2945,
  lon: 18.6714,
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/**
 * Oblicza odległość w kilometrach wzorem Haversine.
 */
export function calculateDistanceKm(from: GeoCoords, to: GeoCoords): number {
  const dLat = (to.lat - from.lat) * DEG_TO_RAD;
  const dLon = (to.lon - from.lon) * DEG_TO_RAD;
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Oblicza prawdziwy azymut początkowy (0° = Północ, 90° = Wschód, 180° = Południe, 270° = Zachód).
 */
export function calculateBearingDeg(from: GeoCoords, to: GeoCoords): number {
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const dLon = (to.lon - from.lon) * DEG_TO_RAD;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const rawDeg = Math.atan2(y, x) * RAD_TO_DEG;
  return ((rawDeg % 360) + 360) % 360;
}

/**
 * Normalizuje różnicę kątową do przedziału [-180, 180].
 * 0° oznacza kierunek prosto na wprost (górna krawędź ekranu).
 * Dodatnie wartości to kierunek w prawo, ujemne w lewo.
 */
export function normalizeSignedAngle(deg: number): number {
  let angle = ((deg + 180) % 360 + 360) % 360 - 180;
  if (angle === -180) angle = 180;
  return angle;
}
