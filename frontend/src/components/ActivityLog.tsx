import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, Minus, PanelBottom, PanelLeft, PanelRight, PictureInPicture2 } from 'lucide-react';

export type LogDock = 'right' | 'left' | 'bottom' | 'float';

export interface LogEntry {
  id: number;
  time: string;
  text: string;
  tone: 'info' | 'ok' | 'warn';
  /** Real inputs/outputs of the operation (source, coordinates, counts, timings) */
  details?: string[];
}

interface ActivityLogProps {
  entries: LogEntry[];
  dock: LogDock;
  onDockChange: (dock: LogDock) => void;
  onHide: () => void;
}

const DOCK_OPTIONS: Array<{ dock: LogDock; label: string; Icon: typeof PanelRight }> = [
  { dock: 'left', label: 'Dock left', Icon: PanelLeft },
  { dock: 'bottom', label: 'Dock bottom', Icon: PanelBottom },
  { dock: 'right', label: 'Dock right', Icon: PanelRight },
  { dock: 'float', label: 'Detach (float)', Icon: PictureInPicture2 },
];

const TONE_DOT: Record<LogEntry['tone'], string> = {
  info: 'bg-[#8D96A3]',
  ok: 'bg-[#30A46C]',
  warn: 'bg-[#F5A524]',
};

const FLOAT_W = 460;
const FLOAT_H = 440;

export const ActivityLog: React.FC<ActivityLogProps> = ({ entries, dock, onDockChange, onHide }) => {
  const listRef = useRef<HTMLOListElement>(null);
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, window.innerWidth - FLOAT_W - 24),
    y: 80,
  }));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Keep the newest entry in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  // Keep a floating panel on screen if the window shrinks
  useEffect(() => {
    if (dock !== 'float') return;
    const clamp = () =>
      setPos((p) => ({
        x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - 200)),
        y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 60)),
      }));
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [dock]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dock !== 'float' || (e.target as HTMLElement).closest('button')) return;
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [dock, pos]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.min(Math.max(0, e.clientX - d.dx), Math.max(0, window.innerWidth - 200)),
      y: Math.min(Math.max(0, e.clientY - d.dy), Math.max(0, window.innerHeight - 60)),
    });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const shell =
    dock === 'float'
      ? 'fixed z-40 rounded-lg border border-[#4A525E] shadow-2xl resize overflow-hidden min-w-[320px] min-h-[220px] max-w-[90vw] max-h-[85vh]'
      : dock === 'bottom'
        ? 'h-72 w-full flex-none border-t border-[#2B3038]'
        : `h-full w-[420px] flex-none ${dock === 'right' ? 'border-l' : 'border-r'} border-[#2B3038]`;

  return (
    <section
      aria-labelledby="activity-log-heading"
      className={`flex flex-col bg-[#16191E] font-sans text-[#ECEEF1] ${shell}`}
      style={dock === 'float' ? { left: pos.x, top: pos.y, width: FLOAT_W, height: FLOAT_H } : undefined}
    >
      {/* Header (drag handle when floating) */}
      <div
        className={`flex flex-none items-center gap-2 border-b border-[#2B3038] px-4 py-2.5 ${
          dock === 'float' ? 'cursor-move touch-none select-none' : ''
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {dock === 'float' && <GripHorizontal className="h-4 w-4 flex-none text-[#8D96A3]" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <h2 id="activity-log-heading" className="text-base font-semibold">
            Activity log
          </h2>
          <p className="truncate text-[13px] text-[#8D96A3]">Each step's real data source, inputs and results</p>
        </div>
        <div className="flex flex-none items-center gap-0.5" role="group" aria-label="Log position">
          {DOCK_OPTIONS.map(({ dock: d, label, Icon }) => (
            <button
              key={d}
              type="button"
              onClick={() => onDockChange(d)}
              aria-label={label}
              aria-pressed={dock === d}
              title={label}
              className={`flex h-9 w-9 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE] ${
                dock === d ? 'bg-[#2B3038] text-[#ECEEF1]' : 'text-[#8D96A3] hover:bg-[#1C2026] hover:text-[#ECEEF1]'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={onHide}
            aria-label="Hide activity log"
            title="Hide"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-[#8D96A3] hover:bg-[#1C2026] hover:text-[#ECEEF1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE]"
          >
            <Minus className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Entries, oldest at top, newest at bottom (auto-scrolls) */}
      <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {entries.map((entry, i) => {
          const latest = i === entries.length - 1;
          return (
            <li key={entry.id} className={`rounded-md ${latest ? 'bg-[#1C2026] p-2.5 -mx-2.5' : ''}`}>
              <div className="flex items-start gap-2.5">
                <span className={`mt-[7px] h-2 w-2 flex-none rounded-full ${TONE_DOT[entry.tone]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug">
                    <span className="mr-2 tabular-nums text-[#8D96A3]">{entry.time}</span>
                    <span className={entry.tone === 'warn' ? 'text-[#F5C451]' : 'text-[#ECEEF1]'}>{entry.text}</span>
                  </p>
                  {entry.details && entry.details.length > 0 && (
                    <ul className="mt-1 space-y-0.5 border-l-2 border-[#2B3038] pl-3">
                      {entry.details.map((d, j) => (
                        <li key={j} className="break-words text-sm tabular-nums leading-snug text-[#B4BBC5]">
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
