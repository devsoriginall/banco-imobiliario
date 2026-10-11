import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlaceArt, SCENE_IDS } from '@/components/PlaceArt';
import { SPACES } from './data';
import { placeAccent, placeMotif, PLACE_MOTIFS } from './placeMotifs';

const buyable = SPACES.map((s, i) => (s.type === 'street' || s.type === 'company' ? i : -1)).filter((i) => i >= 0);

describe('ilustrações dos títulos', () => {
  it('as 28 casas compráveis (22 ruas e 6 empresas) têm cada uma um tema diferente', () => {
    expect(buyable).toHaveLength(28);
    const motifs = buyable.map((i) => placeMotif(i)?.motif);
    expect(motifs.every(Boolean)).toBe(true);
    expect(new Set(motifs).size).toBe(28);
    expect(Object.keys(PLACE_MOTIFS).map(Number).sort((a, b) => a - b)).toEqual(buyable);
  });

  it('casas especiais não têm ilustração', () => {
    for (const i of SPACES.keys()) if (!buyable.includes(i)) expect(placeMotif(i)).toBeNull();
  });

  it('todo tema tem cena desenhada, e cada SVG é único, acessível e compacto', () => {
    expect(new Set(SCENE_IDS)).toEqual(new Set(buyable.map((i) => placeMotif(i)!.motif)));
    const seen = new Set<string>();
    for (const i of buyable) {
      const svg = renderToStaticMarkup(createElement(PlaceArt, { idx: i, size: 160 }));
      expect(svg).toContain('role="img"');
      expect(svg).toContain(`aria-label="Ilustração de ${SPACES[i].name.replace(/&/g, '&amp;')}`);
      expect(svg).toContain(placeAccent(i));
      const shapes = svg.match(/<(rect|circle|ellipse|path|line|polygon)\b/g)?.length ?? 0;
      expect(shapes, SPACES[i].name).toBeGreaterThanOrEqual(12);
      expect(shapes, SPACES[i].name).toBeLessThanOrEqual(60);
      const body = svg.replace(/id="[^"]*"|url\(#[^)]*\)|aria-label="[^"]*"/g, '');
      expect(seen.has(body), SPACES[i].name).toBe(false);
      seen.add(body);
    }
  });

  it('sem ilustração fora das casas compráveis', () => {
    expect(renderToStaticMarkup(createElement(PlaceArt, { idx: 0 }))).toBe('');
  });
});
