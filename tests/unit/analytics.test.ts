import { describe, it, expect } from 'vitest';
import {
  detectAiReferrer,
  resolveGaMeasurementId,
  resolveGscVerification,
  resolveGtmContainerId,
} from '../../src/utils/analytics';

describe('analytics helpers', () => {
  it('validates and normalizes GTM container IDs', () => {
    expect(resolveGtmContainerId('GTM-W3LV2L26')).toBe('GTM-W3LV2L26');
    expect(resolveGtmContainerId('  gtm-abc123  ')).toBe('GTM-ABC123');
    expect(resolveGtmContainerId('none')).toBeNull();
    expect(resolveGtmContainerId('')).toBeNull();
    expect(resolveGtmContainerId('G-ABC1234567')).toBeNull();
  });

  it('validates and normalizes GA4 measurement IDs', () => {
    expect(resolveGaMeasurementId('G-ABC1234567')).toBe('G-ABC1234567');
    expect(resolveGaMeasurementId('  g-abc12345  ')).toBe('G-ABC12345');
    expect(resolveGaMeasurementId('')).toBeNull();
    expect(resolveGaMeasurementId('UA-12345-1')).toBeNull();
    expect(resolveGaMeasurementId('not-a-valid-id')).toBeNull();
  });

  it('normalizes Google Search Console verification tokens', () => {
    expect(resolveGscVerification('abc123XYZ')).toBe('abc123XYZ');
    expect(resolveGscVerification('google-site-verification=abc123XYZ')).toBe('abc123XYZ');
    expect(resolveGscVerification('   ')).toBeNull();
    expect(resolveGscVerification('invalid token with spaces')).toBeNull();
  });

  it('detects AI answer-engine referrers', () => {
    expect(detectAiReferrer('https://chatgpt.com/c/123')).toBe('chatgpt');
    expect(detectAiReferrer('https://www.perplexity.ai/search?q=jmeter')).toBe('perplexity');
    expect(detectAiReferrer('https://claude.ai/chat/abc')).toBe('claude');
    expect(detectAiReferrer('https://gemini.google.com/app')).toBe('gemini');
    expect(detectAiReferrer('https://www.google.com/')).toBeNull();
    expect(detectAiReferrer('not-a-url')).toBeNull();
    expect(detectAiReferrer('')).toBeNull();
  });
});
