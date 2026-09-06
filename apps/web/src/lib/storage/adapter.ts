// Object storage abstraction (Bible Section 14, 25.2). Application code
// talks to this interface only — never to a filesystem path or an S3
// client directly — so swapping the local dev adapter for a real
// S3-compatible backend (ADR-005) touches one file, not every call site.
export interface StoredObject {
  key: string;
  sizeBytes: number;
  checksum: string;
}

export interface StorageAdapter {
  put(params: { key: string; data: Buffer; contentType: string }): Promise<StoredObject>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
