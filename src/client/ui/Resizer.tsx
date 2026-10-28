import { useRef, useState } from 'react';
import type { JSX, KeyboardEvent, PointerEvent } from 'react';

import styles from './Resizer.module.css';

const KEY_STEP = 24;
const KEY_STEP_LARGE = 80;

export interface ResizerProps {
  label: string;
  width: number;
  /** 1 when dragging right widens the panel (a panel on the left), -1 for a panel on the right. */
  direction: 1 | -1;
  onResize: (width: number) => void;
  onReset: () => void;
  /** `dark` for the map's panels, which the artifact drew with a dark line and no overlap. */
  tone?: 'light' | 'dark';
}

/** Ported from the artifact's `resizer()`: pointer drag, arrow keys, double-click to reset. */
export const Resizer = ({
  label,
  width,
  direction,
  onResize,
  onReset,
  tone = 'light',
}: ResizerProps): JSX.Element => {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    if (drag.current !== null) {
      onResize(drag.current.startWidth + direction * (event.clientX - drag.current.startX));
    }
  };

  const handlePointerUp = (): void => {
    drag.current = null;
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onResize(width - direction * step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onResize(width + direction * step);
    }
  };

  return (
    <button
      type="button"
      className={[styles.resizer, tone === 'dark' && styles.dark, dragging && styles.dragging]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${label}. Drag, or use the left and right arrow keys. Double-click to reset.`}
      title="Drag to resize. Double-click to reset."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
};
