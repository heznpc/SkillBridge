/* global test, expect, jest, afterEach */
const fs = require('fs');
const report = require('../scripts/report-academy-drift');

afterEach(() => jest.restoreAllMocks());

function setup(unknown = ['new-course']) {
  jest
    .spyOn(fs, 'readFileSync')
    .mockImplementation((file) =>
      file.endsWith('.json') ? JSON.stringify({ unknown, storeListingIssue: null }) : 'Catalog drift report',
    );
  const issues = { listForRepo: jest.fn(), create: jest.fn(), update: jest.fn() };
  return {
    github: { paginate: jest.fn().mockResolvedValue([]), rest: { issues } },
    context: { repo: { owner: 'example', repo: 'translator' }, serverUrl: 'https://github.com', runId: 123 },
    core: { info: jest.fn() },
  };
}

test('new drift creates one issue and an identical subsequent run performs no mutation', async () => {
  const args = setup();
  await report(args);
  const created = args.github.rest.issues.create.mock.calls[0][0];
  args.github.paginate.mockResolvedValue([{ number: 8, body: created.body }]);
  await report(args);
  expect(args.github.rest.issues.create).toHaveBeenCalledTimes(1);
  expect(args.github.rest.issues.update).not.toHaveBeenCalled();
});

test('changed drift updates the tracked issue instead of creating another', async () => {
  const args = setup();
  args.github.paginate.mockResolvedValue([{ number: 8, body: '<!-- skillbridge-academy-drift -->\nold finding' }]);
  await report(args);
  expect(args.github.rest.issues.create).not.toHaveBeenCalled();
  expect(args.github.rest.issues.update).toHaveBeenCalledWith(
    expect.objectContaining({ issue_number: 8, body: expect.stringContaining('Catalog drift report') }),
  );
});

test('recovery closes only the issue managed by this monitor', async () => {
  const args = setup([]);
  args.github.paginate.mockResolvedValue([
    { number: 7, body: 'An unrelated course issue' },
    { number: 8, body: '<!-- skillbridge-academy-drift -->' },
  ]);
  await report(args);
  expect(args.github.rest.issues.update).toHaveBeenCalledWith(
    expect.objectContaining({ issue_number: 8, state: 'closed', state_reason: 'completed' }),
  );
  expect(args.github.rest.issues.create).not.toHaveBeenCalled();
});

test('GitHub outages fail the monitor instead of silently dropping a finding', async () => {
  const args = setup();
  args.github.paginate.mockRejectedValue(new Error('API unavailable'));
  await expect(report(args)).rejects.toThrow('API unavailable');
});
