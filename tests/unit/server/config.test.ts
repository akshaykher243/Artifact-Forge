import { describe, expect, it } from 'vitest';

import { defaultDataDir, rootPathsFrom } from '../../../src/server/config.ts';

describe('rootPathsFrom', () => {
  it('prefers --root flags over the environment', () => {
    expect(rootPathsFrom(['/a'], { ARTIFACTFORGE_ROOT: '/b' }, '/home/me')).toEqual(['/a']);
  });

  it('reads several folders from ARTIFACTFORGE_ROOT, separated like PATH', () => {
    expect(rootPathsFrom(undefined, { ARTIFACTFORGE_ROOT: '/a:/b:' }, '/home/me')).toEqual([
      '/a',
      '/b',
    ]);
  });

  it('falls back to the home folder', () => {
    expect(rootPathsFrom(undefined, {}, '/home/me')).toEqual(['/home/me']);
  });
});

describe('defaultDataDir', () => {
  it('uses Application Support on macOS', () => {
    expect(defaultDataDir('darwin', {}, '/Users/me')).toBe(
      '/Users/me/Library/Application Support/ArtifactForge',
    );
  });

  it('uses XDG_DATA_HOME, or ~/.local/share, on Linux', () => {
    expect(defaultDataDir('linux', { XDG_DATA_HOME: '/data' }, '/home/me')).toBe(
      '/data/artifactforge',
    );
    expect(defaultDataDir('linux', {}, '/home/me')).toBe('/home/me/.local/share/artifactforge');
  });

  it('uses APPDATA on Windows', () => {
    expect(defaultDataDir('win32', { APPDATA: '/roaming' }, '/home/me')).toBe(
      '/roaming/ArtifactForge',
    );
  });
});
