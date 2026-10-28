import { Fragment } from 'react';
import type { JSX, MouseEvent, PointerEvent, ReactNode } from 'react';

import type { DraftSide } from '../../shared/review.ts';
import type { SplitLine, SplitSide } from './render.ts';
import styles from './SplitRows.module.css';
import { useLineDrag } from './use-line-drag.ts';
import type { LineDragApi } from './use-line-drag.ts';

const TONE_CLASS: Record<SplitSide['tone'], string | undefined> = {
  context: styles.context,
  del: styles.del,
  add: styles.add,
  blank: styles.blank,
};

const KIND_CLASS: Record<string, string | undefined> = {
  plain: styles.plain,
  keyword: styles.keyword,
  string: styles.string,
  number: styles.number,
  literal: styles.literal,
  type: styles.type,
  comment: styles.comment,
};

export interface LineRange {
  side: DraftSide;
  start: number;
  end: number;
}

/** Lets the reviewer pick lines to comment on and shows comments under their lines. */
export interface Commenting {
  /** `extend` is true for a Shift-click, which extends the open range. */
  onPick: (side: DraftSide, line: number, extend: boolean) => void;
  /** A drag from the comment button of `start` over the lines up to `end`. */
  onPickRange: (side: DraftSide, start: number, end: number) => void;
  sameHunk: (side: DraftSide, a: number, b: number) => boolean;
  selected: LineRange | null;
  /** Rows to show after the given line on the given side (drafts, the open comment box). */
  renderAfter: (side: DraftSide, line: number) => ReactNode;
}

const inRange = (range: LineRange | null, side: DraftSide, line: number): boolean =>
  range !== null && range.side === side && line >= range.start && line <= range.end;

interface SideCellsProps {
  side: SplitSide;
  draftSide: DraftSide;
  divider: boolean;
  commenting: Commenting | null;
  lineDrag: LineDragApi;
  /** The lines being dragged over, shown in place of the open range while dragging. */
  highlighted: LineRange | null;
}

const SideCells = ({
  side,
  draftSide,
  divider,
  commenting,
  lineDrag,
  highlighted,
}: SideCellsProps): JSX.Element => {
  const tone = TONE_CLASS[side.tone] ?? '';
  const line = side.lineNumber === '' ? null : Number(side.lineNumber);
  const selected = line !== null && inRange(highlighted, draftSide, line);
  const startDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    if (line !== null && event.button === 0) {
      // Keeps the browser from starting a text selection while dragging over lines.
      event.preventDefault();
      lineDrag.start(draftSide, line, event.shiftKey);
    }
  };
  // Pointer presses are handled by the drag; a click with no pointer is the keyboard.
  const pickWithKeyboard = (event: MouseEvent<HTMLButtonElement>): void => {
    if (line !== null && event.detail === 0) {
      commenting?.onPick(draftSide, line, event.shiftKey);
    }
  };
  const enter = (): void => {
    if (line !== null) {
      lineDrag.enter(draftSide, line);
    }
  };
  return (
    <>
      <div
        className={`${styles.lineNumber} ${tone} ${selected ? styles.selected : ''}`}
        onPointerEnter={enter}
      >
        {commenting && line !== null && (
          <button
            type="button"
            className={styles.gutter}
            aria-label={`Comment on ${draftSide} line ${line}`}
            onPointerDown={startDrag}
            onClick={pickWithKeyboard}
          >
            +
          </button>
        )}
        {side.lineNumber}
      </div>
      <div
        className={`${styles.code} ${tone} ${divider ? styles.divider : ''}`}
        onPointerEnter={enter}
      >
        {side.segments.map((segment, index) => (
          <span
            // Segments are positional slices of one line; their order never changes.
            key={index}
            className={`${KIND_CLASS[segment.kind] ?? ''} ${segment.emphasis ? styles.emphasis : ''}`}
          >
            {segment.text}
          </span>
        ))}
      </div>
    </>
  );
};

const afterRows = (line: SplitLine, commenting: Commenting | null): ReactNode => {
  if (commenting === null || line.kind !== 'code') {
    return null;
  }
  const oldLine = line.left.lineNumber === '' ? null : Number(line.left.lineNumber);
  const newLine = line.right.lineNumber === '' ? null : Number(line.right.lineNumber);
  return (
    <>
      {oldLine !== null && commenting.renderAfter('old', oldLine)}
      {newLine !== null && commenting.renderAfter('new', newLine)}
    </>
  );
};

interface SplitRowsProps {
  lines: SplitLine[];
  commenting: Commenting | null;
}

const NO_DRAG = {
  sameHunk: () => false,
  onClick: () => undefined,
  onRange: () => undefined,
};

export const SplitRows = ({ lines, commenting }: SplitRowsProps): JSX.Element => {
  const lineDrag = useLineDrag(
    commenting === null
      ? NO_DRAG
      : {
          sameHunk: commenting.sameHunk,
          onClick: commenting.onPick,
          onRange: commenting.onPickRange,
        },
  );
  const { drag } = lineDrag;
  const highlighted: LineRange | null = drag
    ? {
        side: drag.side,
        start: Math.min(drag.anchor, drag.current),
        end: Math.max(drag.anchor, drag.current),
      }
    : (commenting?.selected ?? null);
  return (
    <div className={styles.scroller}>
      <div className={drag ? `${styles.table} ${styles.dragging}` : styles.table}>
        {lines.map((line, index) =>
          line.kind === 'fold' ? (
            // Lines are derived from an immutable diff; index is a stable identity here.
            <div key={index} className={styles.fold}>
              <div className={`${styles.foldCell} ${styles.divider}`}>⋯ {line.text}</div>
              <div className={styles.foldCell}>⋯ {line.text}</div>
            </div>
          ) : (
            <Fragment key={index}>
              <div className={styles.row}>
                <SideCells
                  side={line.left}
                  draftSide="old"
                  divider
                  commenting={commenting}
                  lineDrag={lineDrag}
                  highlighted={highlighted}
                />
                <SideCells
                  side={line.right}
                  draftSide="new"
                  divider={false}
                  commenting={commenting}
                  lineDrag={lineDrag}
                  highlighted={highlighted}
                />
              </div>
              {afterRows(line, commenting)}
            </Fragment>
          ),
        )}
      </div>
    </div>
  );
};
