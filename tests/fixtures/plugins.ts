export function makePlugin(overrides: Record<string, any> = {}) {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    vendor: 'TestVendor',
    description: 'A test plugin for unit testing',
    componentClasses: ['com.test.Assertion'],
    helpUrl: 'https://example.com/test-plugin',
    screenshotUrl: '',
    screenshotURL: '',
    sponsored: false,
    isAiReady: false,
    isFeatured: false,
    stats: {
      trendingDelta: 100,
      absoluteDownloads: 50000,
      history: {
        '2025-01-01': 49900,
        '2025-01-08': 50000,
      },
    },
    ...overrides,
  };
}

export function makePluginsList(count: number, overrides: Record<string, any> = {}) {
  return Array.from({ length: count }, (_, i) =>
    makePlugin({
      id: `plugin-${i}`,
      name: `Plugin ${i}`,
      stats: {
        trendingDelta: 100 - i * 10,
        absoluteDownloads: 50000 - i * 1000,
        history: {
          '2025-01-01': 49900 - i * 1000,
          '2025-01-08': 50000 - i * 1000,
        },
      },
      ...overrides,
    })
  );
}
