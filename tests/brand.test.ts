import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import identity from '../src/brand/identity.json';

const read = (path: string): string => readFileSync(path, 'utf8');
const bytes = (path: string): Buffer => readFileSync(path);
const sha256 = (path: string): string =>
  `sha256:${createHash('sha256').update(bytes(path)).digest('hex')}`;

const pngDimensions = (path: string): [number, number] => {
  const png = bytes(path);
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

const webpDimensions = (path: string): [number, number] => {
  const webp = bytes(path);
  expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
  expect(webp.subarray(12, 16).toString('ascii')).toBe('VP8L');
  expect(webp[20]).toBe(0x2f);
  const bits = webp.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
};

const masterFingerprint = (): string => {
  const digest = createHash('sha256');
  const order = ['emblem', 'lockup', 'presentation', 'opticalEmblem'] as const;
  order.forEach((kind, index) => {
    if (index) digest.update(Buffer.from([0]));
    digest.update(bytes(identity.masters[kind].path));
  });
  return `sha256:${digest.digest('hex')}`;
};

describe('owner visual master pack', () => {
  it('keeps the four supplied owner files canonical and byte-locked', () => {
    expect(identity.status).toBe('owner-visual-master-pack');
    expect(identity.metadata.canonical).toBe(true);
    for (const master of Object.values(identity.masters)) {
      expect(existsSync(master.path)).toBe(true);
      expect(sha256(master.path)).toBe(master.sha256);
      expect(pngDimensions(master.path)).toEqual(master.dimensions);
    }
    expect(identity.metadata.fingerprint).toBe(masterFingerprint());
  });

  it('records the exact supplied filenames and assigned roles', () => {
    expect(identity.masters.emblem.sourceFilename).toContain('(1).png');
    expect(identity.masters.lockup.sourceFilename).toContain('(2).png');
    expect(identity.masters.presentation.sourceFilename).toContain('(3).png');
    expect(identity.masters.opticalEmblem.sourceFilename).toContain('(4).png');
    expect(identity.masters.lockup.role).toBe('horizontal-lockup');
    expect(identity.masters.presentation.role).toBe('dark-presentation-reference');
  });

  it('does not retain the rejected hand-drawn SVG geometry', () => {
    expect(existsSync('src/brand/assets/turkcyber-emblem.svg')).toBe(false);
    expect(existsSync('src/brand/assets/turkcyber-lockup.svg')).toBe(false);
  });
});

describe('brand propagation', () => {
  it('renders header and footer variants from generated owner-master derivatives', () => {
    const logo = read('src/components/Logo.astro');
    expect(logo).toContain('identity.derived.emblem');
    expect(logo).toContain('identity.derived.lockup');
    expect(logo).not.toMatch(/svg\?raw|set:html|<path\s+d=/i);
  });

  it('uses the same horizontal owner lockup in /boss', () => {
    const boss = read('worker/routes/boss-views.ts');
    expect(boss).toContain('identity.derived.lockup.publicPath');
    expect(boss).toContain('identity.metadata.fingerprint');
    expect(boss).not.toMatch(/lockupSvg|<span class="t">|emblem\.inkPaths/);
  });

  it('references the raster favicon outputs from HTML and the manifest', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    const manifest = read('public/site.webmanifest');
    expect(layout).toContain('/favicon-16.png');
    expect(layout).toContain('/favicon-32.png');
    expect(manifest).toContain('/favicon-32.png');
    expect(layout).not.toContain('/favicon.svg');
  });

  it('composites the owner lockup directly into OG instead of typesetting a replacement', () => {
    const generator = read('scripts/generate-og-default.py');
    expect(generator).toContain('master_artwork("lockup")');
    expect(generator).not.toMatch(/"TURK"|"CYBER"/);
  });
});

describe('derived brand outputs', () => {
  it('keeps every output current with its recorded hash', () => {
    for (const asset of Object.values(identity.derived)) {
      expect(existsSync(asset.path)).toBe(true);
      expect(sha256(asset.path)).toBe(asset.sha256);
    }
  });

  it('keeps transparent display derivatives at the recorded dimensions', () => {
    expect(webpDimensions(identity.derived.lockup.path)).toEqual(
      identity.derived.lockup.dimensions,
    );
    expect(webpDimensions(identity.derived.emblem.path)).toEqual(
      identity.derived.emblem.dimensions,
    );
  });

  it.each([
    ['favicon16', 16, 16],
    ['favicon32', 32, 32],
    ['appleTouch', 180, 180],
    ['icon192', 192, 192],
    ['icon512', 512, 512],
    ['openGraph', 1200, 630],
  ] as const)('%s has the required %ix%i dimensions', (kind, width, height) => {
    expect(pngDimensions(identity.derived[kind].path)).toEqual([width, height]);
  });
});
