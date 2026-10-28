import type { JSX } from 'react';

import type { DiffRow } from '../../shared/comparison.ts';
import type { TokenKind } from '../diff/render.ts';
import { segments } from '../diff/render.ts';
import styles from './UnifiedRows.module.css';

const KIND_CLASS: Record<TokenKind, string | undefined> = {
  plain: styles.plain,
  keyword: styles.keyword,
  string: styles.string,
  number: styles.number,
  literal: styles.literal,
  type: styles.type,
  comment: styles.comment,
};

const SIGN: Record<DiffRow[0], string> = { ' ': '', '-': '−', '+': '+', '~': '' };
const TONE_CLASS: Record<DiffRow[0], string> = {
  ' ': styles.row ?? '',
  '-': `${styles.row} ${styles.del}`,
  '+': `${styles.row} ${styles.add}`,
  '~': '',
};

interface RowProps {
  row: DiffRow;
}

const Row = ({ row }: RowProps): JSX.Element => {
  const [sign, oldLine, newLine, text] = row;
  if (sign === '~') {
    return <div className={styles.fold}>⋯ {text}</div>;
  }
  return (
    <div className={TONE_CLASS[sign]}>
      <div className={styles.lineNo}>{(sign === '+' ? newLine : oldLine) ?? ''}</div>
      <div className={styles.sign}>{SIGN[sign]}</div>
      <div className={styles.code}>
        {segments(text, null).map((segment, index) => (
          <span key={index} className={KIND_CLASS[segment.kind]}>
            {segment.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export interface UnifiedRowsProps {
  rows: readonly DiffRow[];
}

/** The artifact's drawer diff: one column, line number, sign and highlighted code. */
export const UnifiedRows = ({ rows }: UnifiedRowsProps): JSX.Element => (
  <div className={styles.rows}>
    {rows.map((row, index) => (
      <Row key={index} row={row} />
    ))}
  </div>
);
