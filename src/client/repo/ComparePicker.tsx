import { useState } from 'react';
import type { FormEvent, JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import type { OpenedRepository, RefList } from '../../shared/repository.ts';
import { callOperation, OperationError } from '../app/api.ts';
import styles from './RepoPicker.module.css';

const SUGGESTIONS_ID = 'ref-suggestions';
const DEFAULT_BASES = ['main', 'master', 'origin/main', 'origin/master'];

/** `main` or `master` (local first) as base, and the checked-out branch as head. */
export const defaultRefs = (refs: RefList): { base: string; head: string } => {
  const available = new Set([
    ...refs.branches.map((branch) => branch.name),
    ...refs.remoteBranches.map((branch) => branch.name),
  ]);
  const base = DEFAULT_BASES.find((name) => available.has(name)) ?? '';
  const head = refs.head !== null && refs.head !== base ? refs.head : '';
  return { base, head };
};

export interface ComparePickerProps {
  repository: OpenedRepository;
  refs: RefList;
  onCompared: (comparison: Comparison) => void;
}

export const ComparePicker = ({
  repository,
  refs,
  onCompared,
}: ComparePickerProps): JSX.Element => {
  const defaults = defaultRefs(refs);
  const [base, setBase] = useState(defaults.base);
  const [head, setHead] = useState(defaults.head);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const suggestions = [...refs.branches, ...refs.remoteBranches, ...refs.tags].map(
    (ref) => ref.name,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setComparing(true);
    setError(null);
    try {
      onCompared(
        await callOperation('compare', { source: 'git', repo: repository.path, base, head }),
      );
    } catch (failure) {
      setError(
        failure instanceof OperationError ? failure.message : 'Could not compare these refs.',
      );
      setComparing(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
      <label className={styles.label} htmlFor="compare-base">
        Base
      </label>
      <input
        id="compare-base"
        className={styles.input}
        value={base}
        list={SUGGESTIONS_ID}
        onChange={(event) => setBase(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <label className={styles.label} htmlFor="compare-head">
        Head
      </label>
      <input
        id="compare-head"
        className={styles.input}
        value={head}
        list={SUGGESTIONS_ID}
        onChange={(event) => setHead(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={SUGGESTIONS_ID}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className={styles.row}>
        <button
          type="submit"
          className={styles.open}
          disabled={comparing || base.trim() === '' || head.trim() === ''}
        >
          Compare
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
};
