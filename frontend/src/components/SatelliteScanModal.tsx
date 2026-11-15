import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface SatelliteScanModalProps {
  open: boolean;
  beforeSrc: string;
  afterSrc: string;
  status: 'scanning' | 'complete';
  hazardCount: number | null;
  onClose: () => void;
}

const TITLE_ID = 'sat-scan-modal-title';

const ImageryUnavailable: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-[#070B12] text-[10px] tracking-wider text-slate-500">
    IMAGERY UNAVAILABLE
  </div>
);

export const SatelliteScanModal: React.FC<SatelliteScanModalProps> = ({
  open,
  beforeSrc,
  afterSrc,
  status,
  hazardCount,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [split, setSplit] = useState(50);
  const [beforeFailed, setBeforeFailed] = useState(false);
  const [afterFailed, setAfterFailed] = useState(false);

  // Reset view state and focus the close button each time the modal opens
  useEffect(() => {
    if (!open) return;
    setSplit(50);
    setBeforeFailed(false);
    setAfterFailed(false);
    closeButtonRef.current?.focus();
  }, [open]);

  // Escape closes the modal
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const scanning = status === 'scanning';

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#070B12]/80 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
    >
      <div className="w-full max-w-3xl bg-[#0B111E] border border-radar-border rounded-lg font-mono shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-radar-border">
          <h2 id={TITLE_ID} className="text-xs font-bold tracking-wider text-radar-cyan">
            [SAT-LINK] ORBITAL PASS · KLANG RIVER BASIN
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[9px] tracking-wider text-radar-amber">
              SIMULATED EVENT · SAMPLE IMAGERY
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close satellite scan"
              className="p-1 rounded text-slate-400 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-radar-cyan"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Before / After comparison */}
        <div className="p-4">
          <div className="relative w-full aspect-video overflow-hidden rounded border border-radar-border bg-[#070B12]">
            {/* BEFORE (base layer) */}
            {beforeFailed ? (
              <ImageryUnavailable />
            ) : (
              <img
                src={beforeSrc}
                alt="Before flood satellite imagery"
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setBeforeFailed(true)}
              />
            )}

            {/* AFTER (clipped top layer) */}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              {afterFailed ? (
                <ImageryUnavailable />
              ) : (
                <img
                  src={afterSrc}
                  alt="After flood satellite imagery"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => setAfterFailed(true)}
                />
              )}
            </div>

            {/* Divider */}
            <div
              className="absolute top-0 bottom-0 w-px bg-radar-cyan shadow-[0_0_8px_#00F0FF] pointer-events-none"
              style={{ left: `${split}%` }}
            />

            {/* Corner labels */}
            <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] tracking-wider text-slate-200 bg-[#070B12]/80 rounded pointer-events-none">
              BEFORE
            </span>
            <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] tracking-wider text-slate-200 bg-[#070B12]/80 rounded pointer-events-none">
              AFTER
            </span>

            {/* Scanline sweep */}
            {scanning && <div className="scan-sweep pointer-events-none" />}
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Before/after comparison"
            className="w-full mt-3 accent-[#00F0FF] cursor-ew-resize"
          />

          {/* Status */}
          <div className="mt-3 min-h-[2.25rem]">
            {scanning ? (
              <>
                <div className="relative h-1 w-full overflow-hidden rounded bg-radar-border">
                  <div className="scan-progress absolute top-0 bottom-0 bg-radar-cyan" />
                </div>
                <p className="mt-2 text-[10px] tracking-wider text-radar-cyan" aria-live="polite">
                  qwen3-vl:4b ANALYZING DAMAGE…
                </p>
              </>
            ) : (
              <p className="text-xs font-bold tracking-wider text-radar-crimson" aria-live="polite">
                ANALYSIS COMPLETE · {hazardCount ?? '—'} HAZARD {hazardCount === 1 ? 'ZONE' : 'ZONES'}
              </p>
            )}
          </div>

          {/* Required imagery attribution (Dev 3: pitch/assets/README.md) */}
          <p className="mt-3 text-[9px] leading-snug text-slate-500">
            BEFORE: Esri World Imagery — Esri, Vantor, Earthstar Geographics, and the GIS User Community. AFTER: AI-generated
            flood composite of the same scene.
          </p>
        </div>
      </div>
    </div>
  );
};
