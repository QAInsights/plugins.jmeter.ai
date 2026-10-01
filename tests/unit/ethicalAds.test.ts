import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ETHICAL_ADS_PUBLISHER,
  FLOATING_AD_PLACEMENTS,
  MAX_AD_KEYWORDS,
  adKeywords,
  ethicalAdsPublisher,
  resolveEthicalAdsPublisher,
} from '../../src/utils/ethicalAds';

describe('ethicalAdsPublisher', () => {
  it('accepts a valid publisher id', () => {
    expect(ethicalAdsPublisher(' qainsightscom ')).toBe('qainsightscom');
  });

  it('rejects empty or malformed ids', () => {
    expect(ethicalAdsPublisher(undefined)).toBeNull();
    expect(ethicalAdsPublisher('')).toBeNull();
    expect(ethicalAdsPublisher('bad id"><script>')).toBeNull();
  });
});

describe('resolveEthicalAdsPublisher', () => {
  it('falls back to the default publisher when unset', () => {
    expect(resolveEthicalAdsPublisher(undefined)).toBe(DEFAULT_ETHICAL_ADS_PUBLISHER);
  });

  it('disables ads with "off" or an empty value', () => {
    expect(resolveEthicalAdsPublisher('off')).toBeNull();
    expect(resolveEthicalAdsPublisher(' OFF ')).toBeNull();
    expect(resolveEthicalAdsPublisher('')).toBeNull();
  });

  it('uses a valid override', () => {
    expect(resolveEthicalAdsPublisher('other-pub')).toBe('other-pub');
  });
});

describe('adKeywords', () => {
  it('slugifies, dedupes and pipe-joins topics', () => {
    expect(adKeywords(['JMeter', 'Kafka Load Testing', 'jmeter', null, undefined, '  '])).toBe(
      'jmeter|kafka-load-testing',
    );
  });

  it('caps the keyword count', () => {
    const many = Array.from({ length: 20 }, (_, i) => `topic ${i}`);
    expect(adKeywords(many).split('|')).toHaveLength(MAX_AD_KEYWORDS);
  });
});

describe('FLOATING_AD_PLACEMENTS', () => {
  it('uses an image StickyBox on wide screens and a text FixedFooter otherwise', () => {
    expect(FLOATING_AD_PLACEMENTS.wide).toMatchObject({ type: 'image', style: 'stickybox' });
    expect(FLOATING_AD_PLACEMENTS.narrow).toMatchObject({ type: 'text', style: 'fixedfooter' });
  });
});
