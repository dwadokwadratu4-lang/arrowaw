import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateBearingDeg,
  calculateDistanceKm,
  GeoCoords,
  GLIWICE_FALLBACK_COORDS,
  normalizeSignedAngle,
  RACIBORZ_CASTLE_COORDS,
} from '../utils/geo';

export type GpsStatus = 'waiting' | 'active' | 'fallback';
export type CompassMode = 'auto' | 'manual';

export interface SensorSnapshot {
  coords: GeoCoords;
  gpsStatus: GpsStatus;
  compassMode: CompassMode;
  distanceKm: number;
  targetBearingDeg: number;
  compassHeadingDeg: number;
  relativeAngleDeg: number; // 0° = góra ekranu, >0 prawo, <0 lewo
  isFlat: boolean;
  betaDeg: number;
  gammaDeg: number;
  hasRealCompass: boolean;
  lastMotionTime: number;
  lastShakeTime: number;
}

interface DeviceOrientationEventWithWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface DeviceOrientationPermissionConstructor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

const LAST_GOOD_GPS_KEY = 'czarna_woda_last_good_gps_v1';
const GPS_UPDATE_THRESHOLD_METERS = 200;
const COMPASS_DEADZONE_DEG = 4;

function loadSavedGoodGps(): GeoCoords | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_GOOD_GPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GeoCoords>;
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lon) &&
      parsed.lat >= -90 &&
      parsed.lat <= 90 &&
      parsed.lon >= -180 &&
      parsed.lon <= 180
    ) {
      return { lat: parsed.lat, lon: parsed.lon };
    }
  } catch {
    // Ignoruj błędy dostępu do localStorage (np. tryb prywatny)
  }
  return null;
}

function saveGoodGps(next: GeoCoords): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LAST_GOOD_GPS_KEY,
      JSON.stringify({ lat: next.lat, lon: next.lon }),
    );
  } catch {
    // Ignoruj błędy zapisu do localStorage
  }
}

export function useDeviceSensors() {
  const initialCoordsRef = useRef<GeoCoords>(
    loadSavedGoodGps() ?? GLIWICE_FALLBACK_COORDS,
  );

  const [activated, setActivated] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('waiting');
  const [coords, setCoords] = useState<GeoCoords>(initialCoordsRef.current);
  const [hasRealCompass, setHasRealCompass] = useState(false);
  const [lowCompassAccuracy, setLowCompassAccuracy] = useState(false);
  const [compassMode, setCompassMode] = useState<CompassMode>('auto');

  // Ręczne sterowanie (PC oraz tryb ręczny na smartfonie)
  const [manualHeadingDeg, setManualHeadingDeg] = useState<number>(150);
  const [manualTilted, setManualTilted] = useState<boolean>(false);

  const snapshotRef = useRef<SensorSnapshot>({
    coords: initialCoordsRef.current,
    gpsStatus: 'waiting',
    compassMode: 'auto',
    distanceKm: calculateDistanceKm(
      initialCoordsRef.current,
      RACIBORZ_CASTLE_COORDS,
    ),
    targetBearingDeg: calculateBearingDeg(
      initialCoordsRef.current,
      RACIBORZ_CASTLE_COORDS,
    ),
    compassHeadingDeg: 150,
    relativeAngleDeg: 0,
    isFlat: true,
    betaDeg: 0,
    gammaDeg: 0,
    hasRealCompass: false,
    lastMotionTime: performance.now(),
    lastShakeTime: 0,
  });

  const prevAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const hasInitializedCompassRef = useRef(false);
  const acceptedHeadingRef = useRef<number>(150);
  const compassModeRef = useRef<CompassMode>('auto');

  const recomputeNav = useCallback(() => {
    const s = snapshotRef.current;
    s.distanceKm = calculateDistanceKm(s.coords, RACIBORZ_CASTLE_COORDS);
    s.targetBearingDeg = calculateBearingDeg(s.coords, RACIBORZ_CASTLE_COORDS);
    s.relativeAngleDeg = normalizeSignedAngle(
      s.targetBearingDeg - s.compassHeadingDeg,
    );
  }, []);

  // Synchronizacja suwaka PC lub trybu ręcznego
  useEffect(() => {
    const s = snapshotRef.current;
    if (!s.hasRealCompass || compassModeRef.current === 'manual') {
      s.compassHeadingDeg = manualHeadingDeg;
      s.lastMotionTime = performance.now();
      recomputeNav();
    }
  }, [manualHeadingDeg, recomputeNav]);

  useEffect(() => {
    const s = snapshotRef.current;
    if (!s.hasRealCompass) {
      s.isFlat = !manualTilted;
      s.betaDeg = manualTilted ? 36 : 0;
      s.gammaDeg = 0;
      s.lastMotionTime = performance.now();
    }
  }, [manualTilted]);

  const registerMotion = useCallback(() => {
    snapshotRef.current.lastMotionTime = performance.now();
  }, []);

  const triggerManualShake = useCallback(() => {
    const now = performance.now();
    snapshotRef.current.lastMotionTime = now;
    snapshotRef.current.lastShakeTime = now;
  }, []);

  const toggleCompassMode = useCallback(() => {
    setCompassMode((prev) => {
      const next: CompassMode = prev === 'auto' ? 'manual' : 'auto';
      compassModeRef.current = next;
      const s = snapshotRef.current;
      s.compassMode = next;
      s.lastMotionTime = performance.now();

      if (next === 'manual') {
        const currentHeading = ((s.compassHeadingDeg % 360) + 360) % 360;
        setManualHeadingDeg(currentHeading);
      } else if (s.hasRealCompass && hasInitializedCompassRef.current) {
        s.compassHeadingDeg = acceptedHeadingRef.current;
        recomputeNav();
      }
      return next;
    });
  }, [recomputeNav]);

  const adjustManualHeading = useCallback(
    (deltaDeg: number) => {
      const s = snapshotRef.current;
      const next = (((s.compassHeadingDeg + deltaDeg) % 360) + 360) % 360;
      s.compassHeadingDeg = next;
      s.lastMotionTime = performance.now();
      recomputeNav();
      setManualHeadingDeg(next);
    },
    [recomputeNav],
  );

  const handleOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const ev = event as DeviceOrientationEventWithWebkit;
      let heading: number | null = null;

      if (
        typeof ev.webkitCompassHeading === 'number' &&
        !Number.isNaN(ev.webkitCompassHeading)
      ) {
        heading = ev.webkitCompassHeading;
      } else if (typeof ev.alpha === 'number' && !Number.isNaN(ev.alpha)) {
        // Android / W3C: alpha jest przeciwnie do ruchu wskazówek zegara
        heading = (360 - ev.alpha) % 360;
      }

      if (heading !== null) {
        const normalized = ((heading % 360) + 360) % 360;

        if (!hasInitializedCompassRef.current) {
          hasInitializedCompassRef.current = true;
          acceptedHeadingRef.current = normalized;
          if (compassModeRef.current === 'auto') {
            snapshotRef.current.compassHeadingDeg = normalized;
            snapshotRef.current.lastMotionTime = performance.now();
          }
        } else {
          // Strefa martwa (histereza ±4°): ignoruj drobne zakłócenia magnetometru w budynku
          const delta = Math.abs(
            normalizeSignedAngle(normalized - acceptedHeadingRef.current),
          );
          if (delta >= COMPASS_DEADZONE_DEG) {
            acceptedHeadingRef.current = normalized;
            if (compassModeRef.current === 'auto') {
              snapshotRef.current.compassHeadingDeg = normalized;
              snapshotRef.current.lastMotionTime = performance.now();
            }
          }
        }

        snapshotRef.current.hasRealCompass = true;
        setHasRealCompass(true);
      }

      if (
        typeof ev.webkitCompassAccuracy === 'number' &&
        !Number.isNaN(ev.webkitCompassAccuracy)
      ) {
        const isLowAcc =
          ev.webkitCompassAccuracy < 0 || ev.webkitCompassAccuracy > 20;
        setLowCompassAccuracy(isLowAcc);
      }

      if (typeof ev.beta === 'number' && typeof ev.gamma === 'number') {
        const prevFlat = snapshotRef.current.isFlat;
        snapshotRef.current.betaDeg = ev.beta;
        snapshotRef.current.gammaDeg = ev.gamma;
        const flatNow = Math.abs(ev.beta) <= 25 && Math.abs(ev.gamma) <= 25;
        snapshotRef.current.isFlat = flatNow;
        if (flatNow !== prevFlat) {
          snapshotRef.current.lastMotionTime = performance.now();
        }
      }

      recomputeNav();
    },
    [recomputeNav],
  );

  const handleDeviceMotion = useCallback((event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;

    if (!prevAccelRef.current) {
      prevAccelRef.current = { x, y, z };
      return;
    }

    const dx = Math.abs(x - prevAccelRef.current.x);
    const dy = Math.abs(y - prevAccelRef.current.y);
    const dz = Math.abs(z - prevAccelRef.current.z);
    prevAccelRef.current = { x, y, z };

    const jerk = dx + dy + dz;
    const now = performance.now();

    if (jerk > 0.75) {
      snapshotRef.current.lastMotionTime = now;
    }
    if (jerk > 12.5) {
      snapshotRef.current.lastShakeTime = now;
      snapshotRef.current.lastMotionTime = now;
    }
  }, []);

  const activateAllSensors = useCallback(async () => {
    setActivated(true);
    snapshotRef.current.lastMotionTime = performance.now();
    snapshotRef.current.lastShakeTime = performance.now();

    // 1. iOS DeviceOrientation permission
    try {
      const DOE = DeviceOrientationEvent as unknown as DeviceOrientationPermissionConstructor;
      if (typeof DOE?.requestPermission === 'function') {
        await DOE.requestPermission();
      }
    } catch {
      // Fallback dla urządzeń bez iOS
    }

    // 2. iOS DeviceMotion permission
    try {
      const DME = DeviceMotionEvent as unknown as DeviceOrientationPermissionConstructor;
      if (typeof DME?.requestPermission === 'function') {
        await DME.requestPermission();
      }
    } catch {
      // Ignoruj brak zgody lub wsparcia
    }

    // 3. Nasłuchiwanie kompasu i akcelerometru
    window.addEventListener(
      'deviceorientationabsolute',
      handleOrientation as EventListener,
      true,
    );
    window.addEventListener(
      'deviceorientation',
      handleOrientation as EventListener,
      true,
    );
    window.addEventListener(
      'devicemotion',
      handleDeviceMotion as EventListener,
      true,
    );

    // 4. Stabilizacja GPS w budynkach: jednorazowe pobranie pozycji z pamięcią localStorage i progiem > 200 m
    if ('geolocation' in navigator) {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const candidate: GeoCoords = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            };
            const saved = loadSavedGoodGps();

            if (!saved) {
              saveGoodGps(candidate);
              snapshotRef.current.coords = candidate;
              snapshotRef.current.gpsStatus = 'active';
              setCoords(candidate);
              setGpsStatus('active');
            } else {
              const movedMeters = calculateDistanceKm(saved, candidate) * 1000;
              if (movedMeters > GPS_UPDATE_THRESHOLD_METERS) {
                saveGoodGps(candidate);
                snapshotRef.current.coords = candidate;
                snapshotRef.current.gpsStatus = 'active';
                setCoords(candidate);
                setGpsStatus('active');
              } else {
                // W promieniu 200 m zachowaj stabilną pozycję z pamięci
                snapshotRef.current.coords = saved;
                snapshotRef.current.gpsStatus = 'active';
                setCoords(saved);
                setGpsStatus('active');
              }
            }
            recomputeNav();
          },
          () => {
            const saved = loadSavedGoodGps();
            if (saved) {
              snapshotRef.current.coords = saved;
              snapshotRef.current.gpsStatus = 'active';
              setCoords(saved);
              setGpsStatus('active');
            } else {
              snapshotRef.current.coords = GLIWICE_FALLBACK_COORDS;
              snapshotRef.current.gpsStatus = 'fallback';
              setCoords(GLIWICE_FALLBACK_COORDS);
              setGpsStatus('fallback');
            }
            recomputeNav();
          },
          {
            enableHighAccuracy: false,
            maximumAge: 300000,
            timeout: 8000,
          },
        );
      } catch {
        const saved = loadSavedGoodGps();
        if (saved) {
          snapshotRef.current.coords = saved;
          snapshotRef.current.gpsStatus = 'active';
          setCoords(saved);
          setGpsStatus('active');
        } else {
          snapshotRef.current.gpsStatus = 'fallback';
          setGpsStatus('fallback');
        }
        recomputeNav();
      }
    } else {
      const saved = loadSavedGoodGps();
      if (saved) {
        snapshotRef.current.coords = saved;
        snapshotRef.current.gpsStatus = 'active';
        setCoords(saved);
        setGpsStatus('active');
      } else {
        snapshotRef.current.gpsStatus = 'fallback';
        setGpsStatus('fallback');
      }
      recomputeNav();
    }

    // 5. Mikro-wibracja aktywacji
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {
        // Ignoruj
      }
    }

    const nowAfter = performance.now();
    snapshotRef.current.lastMotionTime = nowAfter;
    snapshotRef.current.lastShakeTime = nowAfter;
  }, [handleDeviceMotion, handleOrientation, recomputeNav]);

  useEffect(() => {
    recomputeNav();
    return () => {
      window.removeEventListener(
        'deviceorientationabsolute',
        handleOrientation as EventListener,
        true,
      );
      window.removeEventListener(
        'deviceorientation',
        handleOrientation as EventListener,
        true,
      );
      window.removeEventListener(
        'devicemotion',
        handleDeviceMotion as EventListener,
        true,
      );
    };
  }, [handleDeviceMotion, handleOrientation, recomputeNav]);

  return {
    activated,
    gpsStatus,
    coords,
    hasRealCompass,
    lowCompassAccuracy,
    compassMode,
    toggleCompassMode,
    manualHeadingDeg,
    setManualHeadingDeg,
    adjustManualHeading,
    manualTilted,
    setManualTilted,
    snapshotRef,
    activateAllSensors,
    registerMotion,
    triggerManualShake,
  };
}
