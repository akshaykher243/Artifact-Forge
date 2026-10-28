import { useState } from 'react';
import type { JSX } from 'react';

import { draftLocation } from './draft-order.ts';
import styles from './Drafts.module.css';
import { useReviewActions } from './review-state.ts';
import type { Composer } from './review-state.ts';

export interface CommentComposerProps {
  composer: Composer;
}

export const CommentComposer = ({ composer }: CommentComposerProps): JSX.Element => {
  const { typeComment, saveComment, cancelComment } = useReviewActions();
  const [text, setText] = useState(composer.body);
  const location = draftLocation(composer);
  const empty = text.trim() === '';

  return (
    <div className={`${styles.draft} ${styles.isDraft} ${styles.composer}`}>
      <div className={styles.draftHeader}>
        <span className={styles.stateLabel}>Draft</span>
        <span className={styles.location}>{location}</span>
        {composer.error && (
          <span className={styles.error} role="alert">
            {composer.error}
          </span>
        )}
      </div>
      <textarea
        className={styles.textarea}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          typeComment(event.target.value);
        }}
        aria-label={`Comment on ${location}`}
        placeholder="Leave a comment"
        rows={3}
        autoFocus
      />
      <div className={styles.composerActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={empty}
          onClick={() => void saveComment()}
        >
          Save draft
        </button>
        <button type="button" className={styles.button} onClick={() => void cancelComment()}>
          Cancel
        </button>
      </div>
    </div>
  );
};
