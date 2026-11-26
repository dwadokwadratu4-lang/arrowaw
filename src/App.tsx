import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { CompassHUD } from './components/CompassHUD';
import { useDeviceSensors } from './hooks/useDeviceSensors';
import { BlackWaterScene, SceneHudState } from './three/BlackWaterScene';
import {
  calculateBearingDeg,
  calculateDistanceKm,
  GLIWICE_FALLBACK_COORDS,
  RACIBORZ_CASTLE_COORDS,
} from './utils/geo';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BlackWaterScene | null>(null);

  const {
    activated,
    gpsStatus,
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
  } = useDeviceSensors();

  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<SceneHudState>(() => ({
    phase: 'waiting',
    isLocked: false,
    isTilted: false,
    isSleeping: false,
    isScared: false,
    dragonEyeOpen: false,
    distanceKm: calculateDistanceKm(
      GLIWICE_FALLBACK_COORDS,
      RACIBORZ_CASTLE_COORDS,
    ),
    relativeAngleDeg: 0,
    targetBearingDeg: calculateBearingDeg(
      GLIWICE_FALLBACK_COORDS,
      RACIBORZ_CASTLE_COORDS,
    ),
    compassHeadingDeg: 150,
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new BlackWaterScene(
      container,
      () => snapshotRef.current,
      registerMotion,
      (nextHud) => setHud(nextHud),
      adjustManualHeading,
    );
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [adjustManualHeading, registerMotion, snapshotRef]);

  const handleActivate = useCallback(async () => {
    await soundEngine.unlock();
    await activateAllSensors();
    sceneRef.current?.activate();
  }, [activateAllSensors]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleTriggerShake = useCallback(() => {
    triggerManualShake();
    sceneRef.current?.triggerWakeSplash();
  }, [triggerManualShake]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black select-none">
      {/* Dedykowany kontener WebGL (izolowany od nakładek React) */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Tafla czarnej wody z magicznym kompasem"
      />

      {/* Nakładka interfejsu HUD */}
      <CompassHUD
        activated={activated}
        hud={hud}
        gpsStatus={gpsStatus}
        hasRealCompass={hasRealCompass}
        lowCompassAccuracy={lowCompassAccuracy}
        compassMode={compassMode}
        onToggleCompassMode={toggleCompassMode}
        manualHeadingDeg={manualHeadingDeg}
        onManualHeadingChange={setManualHeadingDeg}
        manualTilted={manualTilted}
        onManualTiltedToggle={() => setManualTilted((prev) => !prev)}
        muted={muted}
        onToggleMute={handleToggleMute}
        onActivate={handleActivate}
        onTriggerShake={handleTriggerShake}
      />
    </main>
  );
}
