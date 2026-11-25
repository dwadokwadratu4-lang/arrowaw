import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:border-amber-400/70 hover:bg-amber-900/60 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        Zainstaluj aplikację
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-amber-500/35 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-amber-200/90 transition-colors hover:border-amber-400/60 whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Dodaj do ekranu (iOS)
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-zinc-950 p-6 text-amber-100 shadow-2xl">
              <h3 className="font-display text-base font-semibold text-amber-200">
                Instalacja pełnoekranowa (iPhone / iPad)
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
                1. Stuknij przycisk <strong className="text-amber-200">Udostępnij</strong> na pasku Safari.
                <br />
                2. Przewiń i wybierz <strong className="text-amber-200">Do ekranu początkowego</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-lg border border-amber-500/30 bg-amber-950/70 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-900/70"
              >
                Zamknij
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-zinc-950/95 px-3 py-1.5 text-xs font-medium text-amber-300/90 whitespace-nowrap">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Tryb offline · Kompas działa lokalnie</span>
    </div>
  );
};
