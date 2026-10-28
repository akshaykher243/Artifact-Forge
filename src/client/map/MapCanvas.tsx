import { memo } from 'react';
import type { JSX } from 'react';

import type { MapBox, MapLayout, MapLine, MapNode, NodeTone } from './layout.ts';
import styles from './MapCanvas.module.css';

const TONE_CLASS: Record<NodeTone, string | undefined> = {
  added: styles.added,
  changed: styles.changed,
  plain: undefined,
};

const at = (item: { left: number; top: number; width: number; height: number }) => ({
  left: `${item.left}px`,
  top: `${item.top}px`,
  width: `${item.width}px`,
  height: `${item.height}px`,
});

interface BoxProps {
  box: MapBox;
}

const Box = ({ box }: BoxProps): JSX.Element => (
  <div
    className={[
      styles.box,
      box.kind === 'file' ? styles.fileBox : styles.folderBox,
      box.touched && styles.touched,
    ]
      .filter(Boolean)
      .join(' ')}
    style={at(box)}
  >
    <span className={styles.boxLabel}>
      <span className={styles.boxName}>{box.label}</span>{' '}
      <span className={styles.muted}>{box.kind}</span>
    </span>
  </div>
);

interface EdgeProps {
  edge: MapLine;
}

const Edge = ({ edge }: EdgeProps): JSX.Element => (
  <svg
    aria-hidden="true"
    className={styles.edge}
    width={edge.width}
    height={edge.height}
    style={{ left: `${edge.left}px`, top: `${edge.top}px` }}
  >
    <path d={edge.path} />
    <circle cx={edge.endX} cy={edge.endY} r="3" />
  </svg>
);

interface NodeProps {
  node: MapNode;
  onPick: (id: string) => void;
}

const Node = memo(({ node, onPick }: NodeProps): JSX.Element => (
  <button
    type="button"
    className={[styles.node, TONE_CLASS[node.tone], node.selected && styles.selected]
      .filter(Boolean)
      .join(' ')}
    style={at(node)}
    title={node.title}
    aria-pressed={node.selected}
    onClick={() => onPick(node.id)}
  >
    <span className={styles.nodeHead}>
      <span className={styles.nodeLabel}>{node.label}</span>
      <span className={styles.nodeCounts}>
        <span className={styles.addInk}>{node.add}</span>{' '}
        <span className={styles.delInk}>{node.del}</span>{' '}
        <span className={styles.addInk}>{node.mark}</span>
      </span>
    </span>
    <span className={styles.nodeSub}>{node.sub}</span>
    {node.preview.map((row, index) => (
      <span
        key={index}
        className={`${styles.preview} ${row.sign === '+' ? styles.addInk : styles.delInk}`}
      >
        {row.text}
      </span>
    ))}
  </button>
));

const Legend = (): JSX.Element => (
  <div className={styles.legend}>
    <span className={styles.legendItem}>
      <span className={`${styles.swatch} ${styles.added}`} />
      new
    </span>
    <span className={styles.legendItem}>
      <span className={`${styles.swatch} ${styles.changed}`} />
      changed
    </span>
    <span className={styles.legendItem}>
      <span className={styles.swatch} />
      unchanged
    </span>
    <span className={styles.legendItem}>
      <span className={styles.callsSwatch} />
      calls
    </span>
  </div>
);

export interface MapCanvasProps {
  layout: MapLayout;
  zoom: number;
  onPick: (id: string) => void;
  /** Shown over the canvas when the map could not be drawn in full. */
  message: string | null;
}

/** Ported from the artifact's map canvas: a scaled stage of boxes, edges and node buttons. */
export const MapCanvas = ({ layout, zoom, onPick, message }: MapCanvasProps): JSX.Element => (
  <div className={styles.area}>
    <div className={styles.scroller} role="region" aria-label="Map canvas">
      <div
        className={styles.stage}
        style={{ width: `${layout.width * zoom}px`, height: `${layout.height * zoom}px` }}
      >
        <div
          className={styles.inner}
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `scale(${zoom})`,
          }}
        >
          {layout.boxes.map((box) => (
            <Box key={`${box.kind}:${box.left}:${box.top}`} box={box} />
          ))}
          {layout.edges.map((edge, index) => (
            <Edge key={index} edge={edge} />
          ))}
          {layout.nodes.map((node) => (
            <Node key={node.id} node={node} onPick={onPick} />
          ))}
        </div>
      </div>
    </div>
    {message !== null && (
      <p className={styles.message} role="status">
        {message}
      </p>
    )}
    <Legend />
  </div>
);
