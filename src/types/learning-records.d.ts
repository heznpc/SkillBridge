export type Collection = 'reports' | 'bookmarks' | 'notes';
export interface RecordData {
  [key: string]: unknown;
  recordId?: string;
  revision?: number;
  id?: string;
  url?: string;
  title?: string;
  ts?: number;
  text?: string;
  scrollY?: number;
  reportSchemaVersion?: number;
  capture?: string;
  signal?: string;
  originalText?: string | null;
  translatedText?: string;
  selectedText?: string;
  wrongText?: string;
  correction?: string;
  lang?: string;
  correctionStatus?: 'applied' | 'reverted';
}
export type Operation =
  | { operation: 'list' }
  | { operation: 'create'; record: RecordData }
  | { operation: 'update'; recordId: string; expectedRevision: number; patch: RecordData }
  | { operation: 'delete'; recordId: string; expectedRevision: number };
export type Request = { type: 'LEARNING_RECORDS'; collection: Collection; requestId: string } & Operation;
export interface Snapshot {
  records: RecordData[];
  version: number;
  record: RecordData | null;
}
export type Response =
  ({ ok: true; requestId: string } & Snapshot) | { ok: false; requestId: string; code: string; error: string };
export interface StorageAdapter {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(data: Record<string, unknown>): Promise<void>;
}
export interface Receipt {
  requestId: string;
  signature: string;
  recordId: string | null;
}
export interface StoreMeta {
  versions: Partial<Record<Collection, number>>;
  receipts: Receipt[];
}
export interface RecordStoreOptions {
  makeId?: () => string;
  normalize?: (collection: Collection, rows: RecordData[]) => RecordData[];
  limit?: number;
}

export interface CorrectionPage {
  records: ReturnType<typeof import('../lib/learning-record-client').createClient>;
  corrections?: { lookup(source: string, language: string): string | null };
  refreshTranslation(): Promise<void>;
  registerModule?(name: string): void;
}

export interface RecordPage {
  records?: ReturnType<typeof import('../lib/learning-record-client').createClient>;
  $id(id: string): HTMLElement | null;
  t(labels: { en: string; ko: string }): string;
  showRecordError?: (error: Error & { code?: string }, host?: HTMLElement | null) => void;
  registerModule?(name: string): void;
}

export interface ChromeRecordsApi {
  runtime: {
    lastError?: { message?: string };
    sendMessage(request: Request, callback: (response: Response | undefined) => void): void;
  };
  storage: {
    onChanged: { addListener(listener: (changes: Record<string, unknown>, area: string) => void): void };
  };
}
