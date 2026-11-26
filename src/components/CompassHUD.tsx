import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Maximize,
  Minimize,
  Smartphone,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { CompassMode, GpsStatus } from '../hooks/useDeviceSensors';
import { SceneHudState } from '../three/BlackWaterScene';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';

interface CompassHUDProps {
  activated: boolean;
  hud: SceneHudState;
  gpsStatus: GpsStatus;
  hasRealCompass: boolean;
  lowCompassAccuracy: boolean;
  compassMode: CompassMode;
  onToggleCompassMode: () => void;
  manualHeadingDeg: number;
  onManualHeadingChange: (deg: number) => void;
  manualTilted: boolean;
  onManualTiltedToggle: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onActivate: () => void;
  onTriggerShake: () => void;
}

export const CompassHUD: React.FC<CompassHUDProps> = ({
  activated,
  hud,
  gpsStatus,
  hasRealCompass,
  lowCompassAccuracy,
  compassMode,
  onToggleCompassMode,
  manualHeadingDeg,
  onManualHeadingChange,
  manualTilted,
  onManualTiltedToggle,
  muted,
  onToggleMute,
  onActivate,
  onTriggerShake,
}) => {
  // Na PC (brak prawdziwego kompasu) panel testowy jest domyślnie otwarty; na telefonie zwinięty
  const [dockOpen, setDockOpen] = useState<boolean>(!hasRealCompass);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [mobileStartHint, setMobileStartHint] = useState<boolean>(false);

  useEffect(() => {
    if (hasRealCompass) {
      setDockOpen(false);
    }
  }, [hasRealCompass]);

  useEffect(() => {
    if (!activated || !hasRealCompass) return;
    setMobileStartHint(true);
    const timer = window.setTimeout(() => {
      setMobileStartHint(false);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [activated, hasRealCompass]);

  useEffect(() => {
    const handleFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      const fsEl =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;

      if (!fsEl) {
        const el = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Ignoruj jeśli przeglądarka lub iframe ogranicza tryb pełnoekranowy
    }
  }, []);

  const isGlowing = activated && hud.isLocked;
  const emphasizeCalibration =
    compassMode === 'auto' &&
    hasRealCompass &&
    (lowCompassAccuracy || mobileStartHint);

  return (
    <>
      {/* 1. Górne przyciemnienie tła + złoty trójkąt celowniczy + dwuwierszowy nagłówek o wysokim kontraście */}
      <header
        className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col items-center px-14 pt-[max(env(safe-area-inset-top),4px)] pb-5 text-center"
        style={{
          background:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.62) 62%, rgba(0, 0, 0, 0) 100%)',
        }}
      >
        {/* Złoty trójkąt celowniczy skierowany grotem w dół na osi telefonu */}
        <div className="mb-1 flex justify-center">
          <svg
            width="20"
            height="13"
            viewBox="0 0 20 13"
            aria-hidden="true"
            className={`transition-transform duration-500 ${
              isGlowing ? 'scale-110' : 'scale-100'
            }`}
            style={{
              filter: isGlowing
                ? 'drop-shadow(0 0 9px rgba(255, 238, 140, 0.98)) drop-shadow(0 0 20px rgba(245, 158, 11, 0.9))'
                : 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 5px rgba(245, 158, 11, 0.45))',
            }}
          >
            <defs>
              <linearGradient id="target-triangle-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isGlowing ? '#ffffff' : '#fef08a'} />
                <stop offset="55%" stopColor={isGlowing ? '#fde047' : '#f59e0b'} />
                <stop offset="100%" stopColor={isGlowing ? '#f59e0b' : '#b45309'} />
              </linearGradient>
            </defs>
            <polygon
              points="10,12 1.5,1 18.5,1"
              fill="url(#target-triangle-gold)"
              stroke={isGlowing ? '#fffbeb' : '#fde047'}
              strokeWidth="0.9"
            />
          </svg>
        </div>

        <h1 className="font-display flex flex-col items-center leading-tight">
          {/* Wiersz 1: mniejszy, subtelny */}
          <span className="relative inline-block text-[10px] sm:text-[11px] font-medium tracking-[0.26em] uppercase">
            <span
              aria-hidden="true"
              className="select-none text-transparent"
              style={{
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.95)',
              }}
            >
              GDZIE JEST
            </span>
            <span
              className="absolute inset-0 bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #ffffff 0%, #fde047 60%, #f59e0b 100%)',
                filter: isGlowing
                  ? 'drop-shadow(0 0 8px rgba(253, 224, 71, 0.65))'
                  : 'drop-shadow(0 2px 10px rgba(0, 0, 0, 0.95))',
              }}
            >
              GDZIE JEST
            </span>
          </span>

          {/* Wiersz 2: większy, wyrazisty */}
          <span className="relative mt-0.5 inline-block text-[13px] sm:text-[15px] font-bold tracking-[0.09em] uppercase text-balance">
            <span
              aria-hidden="true"
              className="select-none text-transparent"
              style={{
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.95)',
              }}
            >
              ZAMEK PIASTOWSKI W RACIBORZU
            </span>
            <span
              className="absolute inset-0 bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #ffffff 0%, #fde047 60%, #f59e0b 100%)',
                filter: isGlowing
                  ? 'drop-shadow(0 0 12px rgba(253, 224, 71, 0.8))'
                  : 'drop-shadow(0 2px 10px rgba(0, 0, 0, 0.95))',
              }}
            >
              ZAMEK PIASTOWSKI W RACIBORZU
            </span>
          </span>
        </h1>

        {isGlowing && (
          <p
            className="font-mono-tabular mt-1 text-[11px] font-medium tracking-wider text-amber-100 transition-opacity duration-500"
            style={{
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.95)',
            }}
          >
            {hud.distanceKm.toFixed(1)} km · kierunek wskazany
          </p>
        )}
      </header>

      {/* 2. Dyskretny przycisk pełnego ekranu [ ⛶ ] w prawym górnym rogu */}
      <button
        type="button"
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'}
        aria-label={isFullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'}
        className="fixed right-3 top-[max(env(safe-area-inset-top),8px)] z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/25 bg-black/50 text-amber-300/75 transition-colors hover:border-amber-400/60 hover:bg-black/75 hover:text-amber-200"
      >
        {isFullscreen ? (
          <Minimize className="h-4 w-4" />
        ) : (
          <Maximize className="h-4 w-4" />
        )}
      </button>

      {/* 3. Ekran aktywacji jednym dotknięciem */}
      {!activated && (
        <button
          type="button"
          onClick={onActivate}
          aria-label="Dotknij tafli, aby obudzić kompas"
          className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black/45 px-6 text-center cursor-pointer focus:outline-none"
        >
          <div className="relative flex h-48 w-48 items-center justify-center">
            <span className="animate-water-ring absolute inset-0 rounded-full border border-amber-400/55" />
            <span className="animate-water-ring-delayed absolute inset-0 rounded-full border border-amber-500/35" />
            <span className="h-24 w-24 rounded-full border border-amber-400/25 bg-amber-500/5" />
          </div>

          <p className="font-display mt-6 max-w-xs text-base sm:text-lg font-medium tracking-wide text-amber-200/95 text-balance">
            Dotknij tafli, aby obudzić kompas
          </p>

          <p className="mt-3 text-xs tracking-wide text-amber-500/55">
            Czarna Woda · Projekt DRAGON EYE · Artur Wierzbicki
          </p>
        </button>
      )}

      {/* 4. Dyskretne komunikaty na dole (przechył telefonu lub stan uśpienia) */}
      {activated && hud.isTilted && !hud.isSleeping && !hud.isScared && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-20 flex justify-center px-6 text-center">
          <p className="text-sm font-medium tracking-wide text-amber-300/85">
            Połóż telefon płasko na dłoni
          </p>
        </div>
      )}

      {activated && hud.isSleeping && !hud.isScared && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-20 flex justify-center px-6 text-center">
          <p className="text-xs tracking-wide text-amber-500/60">
            {hasRealCompass
              ? 'Potrząśnij telefonem lub stuknij dwukrotnie w taflę'
              : 'Kliknij „Potrząśnij” na dole lub stuknij dwukrotnie w taflę'}
          </p>
        </div>
      )}

      {/* 5. Wskaźnik trybu offline */}
      <OfflineIndicator />

      {/* 6. Dyskretny półprzezroczysty panel testowy PC / sterowania na dole ekranu */}
      {activated && (
        <div className="fixed bottom-[max(env(safe-area-inset-bottom),10px)] left-1/2 z-30 w-[min(560px,94vw)] -translate-x-1/2 flex flex-col items-center">
          {!dockOpen && emphasizeCalibration && (
            <p
              className="pointer-events-none mb-1.5 text-center text-[11px] font-medium tracking-wide text-amber-200/95"
              style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.95)' }}
            >
              Kalibracja kompasu: wykonaj telefonem ruch ósemki (∞) w powietrzu
            </p>
          )}

          <button
            type="button"
            onClick={() => setDockOpen((prev) => !prev)}
            className="mb-1 inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-amber-500/20 bg-black/65 px-3 py-1 text-[11px] font-medium text-amber-300/75 transition-colors hover:border-amber-400/50 hover:text-amber-200 whitespace-nowrap"
          >
            {dockOpen ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                {hasRealCompass ? 'Ukryj opcje' : 'Ukryj panel testowy PC'}
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                {hasRealCompass
                  ? `Opcje · ${hud.distanceKm.toFixed(1)} km`
                  : `Panel testowy PC · ${hud.distanceKm.toFixed(1)} km`}
              </>
            )}
          </button>

          {dockOpen && (
            <div className="w-full rounded-2xl border border-amber-500/20 bg-black/75 p-3 text-amber-100 shadow-2xl">
              {/* Czyste metadane bez pigułek */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-400/75">
                <div className="flex items-center gap-2 font-mono-tabular">
                  <span>
                    {gpsStatus === 'active'
                      ? 'GPS aktywny'
                      : 'Gliwice (domyślne)'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{hud.distanceKm.toFixed(1)} km</span>
                  <span aria-hidden="true">·</span>
                  <span>Cel {Math.round(hud.targetBearingDeg)}°</span>
                  <span aria-hidden="true">·</span>
                  <span>Kurs {Math.round(hud.compassHeadingDeg)}°</span>
                </div>
                <span className="text-[10px] text-amber-500/60">
                  {compassMode === 'manual'
                    ? 'Tryb ręczny · przeciągnij palcem w lewo/prawo'
                    : hasRealCompass
                      ? 'Czujniki wygładzone'
                      : 'Tryb symulacji PC'}
                </span>
              </div>

              {/* Suwak obrotu 0°–360° + przycisk Potrząśnij dla PC */}
              {!hasRealCompass && (
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs text-amber-200/85">
                      <label
                        htmlFor="compass-sim-slider"
                        className="flex items-center gap-1.5 font-medium truncate"
                      >
                        <Compass className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span>Obrót wirtualnego kompasu</span>
                      </label>
                      <span className="font-mono-tabular text-amber-300 ml-2 shrink-0">
                        {Math.round(manualHeadingDeg)}°
                      </span>
                    </div>
                    <input
                      id="compass-sim-slider"
                      type="range"
                      min={0}
                      max={359}
                      value={manualHeadingDeg}
                      onChange={(e) =>
                        onManualHeadingChange(Number(e.target.value))
                      }
                      className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800/90 accent-amber-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onTriggerShake}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:border-amber-400/70 hover:bg-amber-900/70 whitespace-nowrap"
                  >
                    <Waves className="h-3.5 w-3.5 text-amber-300" />
                    Potrząśnij
                  </button>
                </div>
              )}

              {/* Pozostałe opcje */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {hasRealCompass && (
                  <button
                    type="button"
                    onClick={onTriggerShake}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/50 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-900/60 whitespace-nowrap"
                  >
                    <Waves className="h-3.5 w-3.5" />
                    Potrząśnij
                  </button>
                )}

                {!hasRealCompass && (
                  <button
                    type="button"
                    onClick={onManualTiltedToggle}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      manualTilted
                        ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                        : 'border-amber-500/25 bg-zinc-900/80 text-amber-200/80 hover:bg-zinc-800'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    {manualTilted ? 'Przechylony (>25°)' : 'Położony płasko'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleMute}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-500/25 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-amber-200/85 transition-colors hover:bg-zinc-800 whitespace-nowrap"
                >
                  {muted ? (
                    <>
                      <VolumeX className="h-3.5 w-3.5 text-amber-500/70" />
                      Wyciszony
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                      Dźwięk
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleCompassMode}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    compassMode === 'manual'
                      ? 'border-amber-400/75 bg-amber-500/20 text-amber-100'
                      : 'border-amber-500/25 bg-zinc-900/80 text-amber-200/85 hover:bg-zinc-800'
                  }`}
                >
                  <Compass className="h-3.5 w-3.5 text-amber-400" />
                  <span>Kompas: {compassMode === 'auto' ? 'Auto' : 'Ręczny'}</span>
                </button>

                <PWAInstallButton />

                <span className="ml-auto text-[11px] font-medium tracking-wide text-amber-300/80 whitespace-nowrap">
                  Koncepcja i realizacja: Artur Wierzbicki
                </span>
              </div>

              {compassMode === 'auto' && (
                <div
                  className={`mt-2 border-t border-amber-500/15 pt-1.5 text-[11px] tracking-wide transition-colors ${
                    emphasizeCalibration
                      ? 'font-medium text-amber-200'
                      : 'text-amber-400/65'
                  }`}
                >
                  Kalibracja kompasu: wykonaj telefonem ruch ósemki (∞) w powietrzu
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
