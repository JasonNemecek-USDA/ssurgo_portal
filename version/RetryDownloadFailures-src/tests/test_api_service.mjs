import assert from 'node:assert/strict';
import test from 'node:test';

import ApiService from '../resources/services/apiService.mjs';
import {getNetworkDownloadConcurrencyCap} from '../resources/services/downloadConcurrency.mjs';

test('blob downloads allow slow WSS archives to complete', () => {
  const service = new ApiService();
  const expectedTimeouts = {
    turbo: 15 * 60 * 1000,
    balanced: 20 * 60 * 1000,
    constrained: 30 * 60 * 1000,
  };

  for (const [profileName, expectedTimeoutMs] of Object.entries(expectedTimeouts)) {
    const policy = service.getRetryOptions('blobDownload', {profileName});
    assert.equal(policy.timeoutMs, expectedTimeoutMs);
  }
});

test('blob download timeout supports explicit overrides', () => {
  const service = new ApiService();
  const policy = service.getRetryOptions('blobDownload', {
    profileName: 'balanced',
    timeoutMs: 42_000,
  });

  assert.equal(policy.timeoutMs, 42_000);
});

test('blob downloads retry browser TimeoutError failures', async (context) => {
  const service = new ApiService();
  service.sleep = async () => {};
  let fetchAttempts = 0;
  const originalFetch = globalThis.fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => {
    fetchAttempts += 1;
    const error = new Error('The operation timed out.');
    error.name = 'TimeoutError';
    throw error;
  };

  await assert.rejects(
    service.getBlob('https://example.test/archive.zip', null, {
      attempts: 2,
      timeoutMs: 1,
      retryDelayMs: 1,
      maxRetryDelayMs: 1,
    }),
    /Blob download timed out after 0 seconds/,
  );
  assert.equal(fetchAttempts, 2);
});

test('large selections cap simultaneous WSS archive transfers', () => {
  assert.equal(getNetworkDownloadConcurrencyCap(3_379), 2);
  assert.equal(getNetworkDownloadConcurrencyCap(500), 4);
  assert.equal(getNetworkDownloadConcurrencyCap(99), Number.POSITIVE_INFINITY);
});