import { describe, expect, it } from 'vitest';
import { inferSurface } from '../../src/tennis/surface.js';

describe('inferSurface', () => {
  it('maps grand-slam slugs', () => {
    expect(inferSurface('tennis_atp_french_open')).toBe('clay');
    expect(inferSurface('tennis_wta_french_open')).toBe('clay');
    expect(inferSurface('tennis_atp_wimbledon')).toBe('grass');
    expect(inferSurface('tennis_atp_us_open')).toBe('hard');
    expect(inferSurface('tennis_atp_aus_open')).toBe('hard');
  });

  it('maps clay tour stops that previously fell through to hard', () => {
    expect(inferSurface('tennis_atp_hamburg_open')).toBe('clay');
    expect(inferSurface('tennis_atp_monte_carlo_masters')).toBe('clay');
    expect(inferSurface('tennis_atp_barcelona')).toBe('clay');
    expect(inferSurface('tennis_atp_munich')).toBe('clay');
    expect(inferSurface('tennis_atp_estoril')).toBe('clay');
    expect(inferSurface('tennis_wta_strasbourg')).toBe('clay');
    expect(inferSurface('tennis_wta_rabat')).toBe('clay');
  });

  it('maps grass tour stops', () => {
    expect(inferSurface('tennis_atp_queens')).toBe('grass');
    expect(inferSurface('tennis_atp_halle')).toBe('grass');
    expect(inferSurface('tennis_wta_eastbourne')).toBe('grass');
    expect(inferSurface('tennis_atp_mallorca')).toBe('grass');
    expect(inferSurface('tennis_atp_newport')).toBe('grass');
  });

  it('defaults unknown slugs to hard', () => {
    expect(inferSurface('tennis_atp_unknown_event')).toBe('hard');
    expect(inferSurface('tennis_wta_tokyo')).toBe('hard');
    expect(inferSurface('')).toBe('hard');
  });

  it('accepts a bare tournament slug, not just sport_key', () => {
    expect(inferSurface('hamburg_open')).toBe('clay');
    expect(inferSurface('french_open')).toBe('clay');
    expect(inferSurface('queens')).toBe('grass');
  });
});
