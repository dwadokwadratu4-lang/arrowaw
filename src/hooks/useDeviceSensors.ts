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

export interface SensorSnapshot {
  coords: GeoCoords;
  gpsStatus: GpsStatus;
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
}

interface DeviceOrientationPermissionConstructor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export function useDeviceSensors() {
  const [activated, setActivated] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('waiting');
  const [coords, setCoords] = useState<GeoCoords>(GLIWICE_FALLBACK_COORDS);
  const [hasRealCompass, setHasRealCompass] = useState(false);

  // Desktop test overrides (start at 150° so arrow visibly swims & taps edge right after waking)
  const [manualHeadingDeg, setManualHeadingDeg] = useState<number>(150);
  const [manualTilted, setManualTilted] = useState<boolean>(false);

  const snapshotRef = useRef<SensorSnapshot>({
    coords: GLIWICE_FALLBACK_COORDS,
    gpsStatus: 'waiting',
    distanceKm: calculateDistanceKm(
      GLIWICE_FALLBACK_COORDS,
      RACIBORZ_CASTLE_COORDS,
    ),
    targetBearingDeg: calculateBearingDeg(
      GLIWICE_FALLBACK_COORDS,
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

  const geoWatchIdRef = useRef<number | null>(null);
  const prevAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const prevHeadingRef = useRef<number>(150);

  const recomputeNav = useCallback(() => {
    const s = snapshotRef.current;
    s.distanceKm = calculateDistanceKm(s.coords, RACIBORZ_CASTLE_COORDS);
    s.targetBearingDeg = calculateBearingDeg(s.coords, RACIBORZ_CASTLE_COORDS);
    s.relativeAngleDeg = normalizeSignedAngle(
      s.targetBearingDeg - s.compassHeadingDeg,
    );
  }, []);

  // Sync manual desktop slider when real compass isn't active
  useEffect(() => {
    const s = snapshotRef.current;
    if (!s.hasRealCompass) {
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

  const handleOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const ev = event as DeviceOrientationEventWithWebkit;
      let heading: number | null = null;

      if (typeof ev.webkitCompassHeading === 'number' && !Number.isNaN(ev.webkitCompassHeading)) {
        heading = ev.webkitCompassHeading;
      } else if (typeof ev.alpha === 'number' && !Number.isNaN(ev.alpha)) {
        // Android / W3C: alpha is counter-clockwise from north when absolute=true
        heading = (360 - ev.alpha) % 360;
      }

      if (heading !== null) {
        const normalized = ((heading % 360) + 360) % 360;
        const delta = Math.abs(
          normalizeSignedAngle(normalized - prevHeadingRef.current),
        );
        if (delta > 1.2) {
          snapshotRef.current.lastMotionTime = performance.now();
        }
        prevHeadingRef.current = normalized;
        snapshotRef.current.compassHeadingDeg = normalized;
        snapshotRef.current.hasRealCompass = true;
        setHasRealCompass(true);
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

    // Delikatny ruch dłoni utrzymuje kompas przy powierzchni
    if (jerk > 0.75) {
      snapshotRef.current.lastMotionTime = now;
    }
    // Wyraźne potrząśnięcie budzi strzałkę z głębiny
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
      // Fallback to desktop / non-iOS behavior
    }

    // 2. iOS DeviceMotion permission
    try {
      const DME = DeviceMotionEvent as unknown as DeviceOrientationPermissionConstructor;
      if (typeof DME?.requestPermission === 'function') {
        await DME.requestPermission();
      }
    } catch {
      // Ignore if denied or unsupported
    }

    // 3. Attach compass & motion listeners
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
    window.addEventListener('devicemotion', handleDeviceMotion as EventListener, true);

    // 4. Geolocation GPS
    if ('geolocation' in navigator) {
      try {
        geoWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const next: GeoCoords = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            };
            snapshotRef.current.coords = next;
            snapshotRef.current.gpsStatus = 'active';
            setCoords(next);
            setGpsStatus('active');
            recomputeNav();
          },
          () => {
            snapshotRef.current.coords = GLIWICE_FALLBACK_COORDS;
            snapshotRef.current.gpsStatus = 'fallback';
            setCoords(GLIWICE_FALLBACK_COORDS);
            setGpsStatus('fallback');
            recomputeNav();
          },
          {
            enableHighAccuracy: true,
            maximumAge: 4000,
            timeout: 8000,
          },
        );
      } catch {
        snapshotRef.current.gpsStatus = 'fallback';
        setGpsStatus('fallback');
        recomputeNav();
      }
    } else {
      snapshotRef.current.gpsStatus = 'fallback';
      setGpsStatus('fallback');
      recomputeNav();
    }

    // 5. Mikro-wibracja aktywacji
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {
        // Ignore
      }
    }

    // Odśwież znacznik ruchu po zakończeniu asynchronicznych zapytań o uprawnienia
    const nowAfter = performance.now();
    snapshotRef.current.lastMotionTime = nowAfter;
    snapshotRef.current.lastShakeTime = nowAfter;
  }, [handleDeviceMotion, handleOrientation, recomputeNav]);

  useEffect(() => {
    recomputeNav();
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
      window.removeEventListener('devicemotion', handleDeviceMotion as EventListener, true);
      if (geoWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, [handleDeviceMotion, handleOrientation, recomputeNav]);

  return {
    activated,
    gpsStatus,
    coords,
    hasRealCompass,
    manualHeadingDeg,
    setManualHeadingDeg,
    manualTilted,
    setManualTilted,
    snapshotRef,
    activateAllSensors,
    registerMotion,
    triggerManualShake,
  };
}
