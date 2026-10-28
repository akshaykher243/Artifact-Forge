import type { Locator, Page } from '@playwright/test';

/** The workspace's Map view. */
export class MapPage {
  readonly mapTab: Locator;
  readonly diffTab: Locator;
  readonly overlay: Locator;
  readonly gitToggle: Locator;
  readonly gitPanel: Locator;
  readonly zoomIn: Locator;
  readonly zoomOut: Locator;
  readonly zoomReset: Locator;
  readonly canvas: Locator;
  readonly nodes: Locator;
  readonly edges: Locator;
  readonly status: Locator;
  readonly openInDiff: Locator;
  readonly closePanel: Locator;
  readonly markReviewed: Locator;

  constructor(readonly page: Page) {
    this.mapTab = page.getByRole('button', { name: 'Map', exact: true });
    this.diffTab = page.getByRole('button', { name: 'Diff', exact: true });
    this.overlay = page.getByRole('button', { name: 'Diff overlay' });
    this.gitToggle = page.getByRole('button', { name: 'Git', exact: true });
    this.gitPanel = page.getByRole('region', { name: 'Git' });
    this.zoomIn = page.getByRole('button', { name: 'Zoom in' });
    this.zoomOut = page.getByRole('button', { name: 'Zoom out' });
    this.zoomReset = page.getByRole('button', { name: 'Reset zoom' });
    this.canvas = page.getByRole('region', { name: 'Map canvas' });
    this.nodes = this.canvas.locator('button');
    this.edges = this.canvas.locator('svg');
    this.status = page.locator('main').getByRole('status');
    this.openInDiff = page.getByRole('button', { name: 'Open in Diff view' });
    this.closePanel = page.getByRole('button', { name: 'Close panel' });
    this.markReviewed = page.getByRole('checkbox', { name: 'Mark reviewed' });
  }

  open = async (): Promise<void> => {
    await this.mapTab.click();
  };

  level = (label: string): Locator => this.page.getByRole('button', { name: label, exact: true });

  /** A map node by the name it shows first (function, file or folder). */
  node = (label: string): Locator =>
    this.nodes.filter({ has: this.page.getByText(label, { exact: true }) });

  /** The label of a folder or file box, which sits at the box's top left. */
  boxLabel = (label: string): Locator => this.canvas.getByText(label, { exact: true });
}
