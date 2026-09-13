import * as records from '../../src/shared/learning-records';
import * as runtime from '../../src/lib/runtime-contracts';
import * as client from '../../src/lib/learning-record-client';
import type { Request } from '../../src/types/learning-records';
const good: Request = {
  type: 'LEARNING_RECORDS',
  collection: 'notes',
  requestId: 'request-id',
  operation: 'create',
  record: { url: 'https://example.test', text: 'note' },
};
void good;
// @ts-expect-error record URLs must be strings
const badRecord: Request = { ...good, record: { url: 42 } };
// @ts-expect-error updates require the revision that the editor read
const badUpdate: Request = {
  type: 'LEARNING_RECORDS',
  collection: 'notes',
  requestId: 'request-id',
  operation: 'update',
  recordId: 'record-id',
  patch: { text: 'note' },
};
// @ts-expect-error translation batches cannot contain objects
runtime.batchRequest([{}], 'ko');
// @ts-expect-error language state cannot use a boolean
runtime.createPageState(() => 'https://example.test').begin(false);
// @ts-expect-error storage must acknowledge writes with a Promise
records.createStore({ get: async () => ({}), set: () => {} });
// @ts-expect-error transport responses cannot be an arbitrary success flag
client.createClient({ send: async () => true });
void badRecord;
void badUpdate;
