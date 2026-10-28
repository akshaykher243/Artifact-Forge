import { useEffect, useRef, useState } from 'react';

import type { DraftSide } from '../../shared/review.ts';

export interface LineDrag {
  side: DraftSide;
  anchor: number;
  current: number;
  /** Shift was held when the drag started, so a plain click extends the open range. */
  shift: boolean;
}

export interface LineDragHandlers {
  /** Lines one hunk on one side may span; a drag never leaves its hunk. */
  sameHunk: (side: DraftSide, a: number, b: number) => boolean;
  /** A press and release on the same line. */
  onClick: (side: DraftSide, line: number, extend: boolean) => void;
  onRange: (side: DraftSide, start: number, end: number) => void;
}

export interface LineDragApi {
  drag: LineDrag | null;
  start: (side: DraftSide, line: number, shift: boolean) => void;
  enter: (side: DraftSide, line: number) => void;
}

/**
 * GitHub-style line selection: press a line's comment button and drag over more lines of the
 * same hunk; the range is picked when the pointer is released anywhere on the page.
 */
export const useLineDrag = (handlers: LineDragHandlers): LineDragApi => {
  const [drag, setDrag] = useState<LineDrag | null>(null);
  const dragRef = useRef<LineDrag | null>(null);
  const handlersRef = useRef(handlers);
  // The window listener reads the latest handlers without re-subscribing on every render.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const update = (next: LineDrag | null): void => {
    dragRef.current = next;
    setDrag(next);
  };

  const active = drag !== null;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const finish = (): void => {
      const done = dragRef.current;
      update(null);
      if (done === null) {
        return;
      }
      if (done.anchor === done.current) {
        handlersRef.current.onClick(done.side, done.anchor, done.shift);
      } else {
        handlersRef.current.onRange(done.side, done.anchor, done.current);
      }
    };
    const cancel = (): void => update(null);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [active]);

  return {
    drag,
    start: (side, line, shift) => update({ side, anchor: line, current: line, shift }),
    enter: (side, line) => {
      const current = dragRef.current;
      if (
        current !== null &&
        current.side === side &&
        current.current !== line &&
        handlersRef.current.sameHunk(side, current.anchor, line)
      ) {
        update({ ...current, current: line });
      }
    },
  };
};
