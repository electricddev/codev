import { describe, it, expect } from 'vitest';
import {
  normalizeProjectId,
  splitProjectId,
  getSpecIdCandidates,
  applyProjectSuffixToSpecName,
} from '../utils/project-id.js';

describe('project-id utils', () => {
  describe('normalizeProjectId', () => {
    it('lowercases and trims', () => {
      expect(normalizeProjectId(' 0006A ')).toBe('0006a');
    });
  });

  describe('splitProjectId', () => {
    it('splits base id and suffix', () => {
      expect(splitProjectId('0006a')).toEqual({ baseId: '0006', suffix: 'a' });
    });

    it('handles numeric ids with no suffix', () => {
      expect(splitProjectId('0006')).toEqual({ baseId: '0006', suffix: '' });
    });

    it('falls back for non-matching ids', () => {
      expect(splitProjectId('feature-1')).toEqual({
        baseId: 'feature-1',
        suffix: '',
      });
    });
  });

  describe('getSpecIdCandidates', () => {
    it('includes base id when suffix is present', () => {
      expect(getSpecIdCandidates('0006a')).toEqual(['0006a', '0006']);
    });

    it('returns only the normalized id when no suffix', () => {
      expect(getSpecIdCandidates('0006')).toEqual(['0006']);
    });
  });

  describe('applyProjectSuffixToSpecName', () => {
    it('injects suffix into spec name', () => {
      expect(applyProjectSuffixToSpecName('0006-foo', '0006a')).toBe(
        '0006a-foo'
      );
    });

    it('keeps spec name when no suffix', () => {
      expect(applyProjectSuffixToSpecName('0006-foo', '0006')).toBe(
        '0006-foo'
      );
    });

    it('keeps spec name when prefix is unexpected', () => {
      expect(
        applyProjectSuffixToSpecName('feature-0006-foo', '0006a')
      ).toBe('feature-0006-foo');
    });
  });
});
