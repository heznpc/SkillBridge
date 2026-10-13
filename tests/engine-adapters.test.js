/* global describe, test, expect, jest */
const { createGoogleAdapter, createLocalAdapter, createCloudAdapter } = require('../src/lib/engine-adapters');
const contracts = require('../src/lib/runtime-contracts');

describe('Google adapter', () => {
  test('retains batch positions and falls back only for a failed protected-term restoration', async () => {
    const sendMessage = jest.fn(async () => ({ ok: true, translations: ['번역 0', '번역 1'] }));
    const getProtectedTerms = jest.fn(() => ({
      maskProtectedTerms: (text) => ({ text: `masked:${text}`, tokens: [text] }),
      unmaskProtectedTerms: (translated, mask) => (mask.tokens[0] === 'Claude' ? null : translated),
    }));
    const reportAvailability = jest.fn();
    const adapter = createGoogleAdapter({
      sendMessage,
      getContracts: () => contracts,
      getProtectedTerms,
      reportAvailability,
    });

    await expect(adapter.translateBatch([' Claude ', 'Anthropic'], 'ko')).resolves.toEqual([' Claude ', '번역 1']);
    expect(sendMessage).toHaveBeenCalledWith(contracts.batchRequest(['masked:Claude', 'masked:Anthropic'], 'ko'));
    expect(getProtectedTerms).toHaveBeenCalledWith('ko');
    expect(reportAvailability).toHaveBeenCalledWith(true, 'batch');
  });

  test('a malformed response retains the original batch and reports the transport failure', async () => {
    const originals = [' Hello ', 'World'];
    const reportAvailability = jest.fn();
    const adapter = createGoogleAdapter({
      sendMessage: async () => ({ ok: true, translations: ['only one result'] }),
      getContracts: () => contracts,
      getProtectedTerms: () => null,
      reportAvailability,
    });
    await expect(adapter.translateBatch(originals, 'nl')).resolves.toBe(originals);
    expect(reportAvailability).toHaveBeenCalledWith(false, 'batch');
  });
});

describe('existing stream adapters', () => {
  test('local retains callback, cancellation and refinement options without substituting a transport', async () => {
    const failure = new Error('local unavailable');
    const pending = Promise.reject(failure);
    const stream = jest.fn(() => pending);
    const options = { signal: new AbortController().signal, purpose: 'refinement' };
    const onChunk = jest.fn();
    const adapter = createLocalAdapter({ stream });
    expect(adapter.stream({ prompt: 'edit', onChunk, options })).toBe(pending);
    await expect(pending).rejects.toBe(failure);
    expect(stream).toHaveBeenCalledWith('edit', onChunk, options);
    expect(stream.mock.calls[0][2]).toBe(options);
  });

  test('cloud passes the requested language, model and cancellation through unchanged', async () => {
    const stream = jest.fn(async () => 'answer');
    const options = { model: 'existing-model', signal: new AbortController().signal };
    const adapter = createCloudAdapter({ stream });
    await expect(adapter.stream({ prompt: 'explain', targetLang: 'nl', onChunk: null, options })).resolves.toBe('answer');
    expect(stream).toHaveBeenCalledWith('explain', 'nl', null, options);
    expect(stream.mock.calls[0][3]).toBe(options);
  });
});
