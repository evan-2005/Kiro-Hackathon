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
  <div className="absolute inset-0 flex items-center justify-center bg-[#0F1115] text-xs text-[#6B7380]">
    Image unavailable
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
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#0F1115]/75 p-6 font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
    >
      <div className="w-full max-w-3xl rounded-lg border border-[#2B3038] bg-[#16191E] text-[#ECEEF1] shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#2B3038] px-5 py-4">
          <div>
            <h2 id={TITLE_ID} className="text-base font-semibold">
              Satellite image comparison
            </h2>
            <p className="mt-0.5 text-sm text-[#A1A8B3]">Klang River basin · before and after flooding</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded border border-[#F5A524]/40 px-1.5 py-0.5 text-[11px] font-medium text-[#F5C451]">
              Simulated scenario
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close satellite scan"
              className="rounded p-1 text-[#A1A8B3] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* Before / After comparison */}
          <div className="relative aspect-video w-full overflow-hidden rounded-md border border-[#2B3038] bg-[#0F1115]">
            {beforeFailed ? (
              <ImageryUnavailable />
            ) : (
              <img
                src={beforeSrc}
                alt="Satellite image before flooding"
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setBeforeFailed(true)}
              />
            )}

            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              {afterFailed ? (
                <ImageryUnavailable />
              ) : (
                <img
                  src={afterSrc}
                  alt="Satellite image after flooding"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setAfterFailed(true)}
                />
              )}
            </div>

            {/* Divider */}
            <div className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-white/90" style={{ left: `${split}%` }} />

            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              Before
            </span>
            <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              After
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Before/after comparison"
            className="mt-3 w-full cursor-ew-resize accent-[#ECEEF1]"
          />

          {/* Status */}
          <div className="mt-3 min-h-[2.75rem]" aria-live="polite">
            {scanning ? (
              <>
                <div className="relative h-1 w-full overflow-hidden rounded bg-[#2B3038]">
                  <div className="scan-progress absolute bottom-0 top-0 bg-[#A1A8B3]" />
                </div>
                <p className="mt-2 text-sm text-[#A1A8B3]">Looking for flooded areas…</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[#FF8B8E]">
                  {hazardCount ?? '—'} flood {hazardCount === 1 ? 'area' : 'areas'} found
                </p>
                <p className="mt-0.5 text-xs text-[#A1A8B3]">AI estimate from imagery — verify on the ground before sending crews.</p>
              </>
            )}
          </div>

          {/* Required imagery attribution (Dev 3: pitch/assets/README.md) */}
          <p className="mt-3 text-[11px] leading-snug text-[#6B7380]">
            Before: Esri World Imagery — Esri, Vantor, Earthstar Geographics, and the GIS User Community. After:
            AI-generated flood composite of the same scene.
          </p>
        </div>
      </div>
    </div>
  );
};
