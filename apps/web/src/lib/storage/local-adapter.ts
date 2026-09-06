import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter, StoredObject } from "./adapter";

// Dev-only local filesystem adapter (Bible Section 14 / ADR-005: a real
// deployment needs S3-compatible storage, decided alongside ADR-010's
// platform choice). Deliberately outside the Next.js `public/` directory
// and outside `src/` so files are never accidentally served statically or
// bundled — the only way to read one back is through this adapter, via
// the signed-download route (see app/api/assets/[id]/download).
const STORAGE_ROOT = path.join(process.cwd(), ".storage");

function resolvePath(key: string) {
  // Reject any key that could escape STORAGE_ROOT (e.g. "../../etc/passwd")
  // — keys are server-generated (see uploadAsset), but this is cheap
  // insurance against a future caller passing something untrusted.
  const resolved = path.join(STORAGE_ROOT, key);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

export const localStorageAdapter: StorageAdapter = {
  async put({ key, data }): Promise<StoredObject> {
    const filePath = resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return {
      key,
      sizeBytes: data.byteLength,
      checksum: createHash("sha256").update(data).digest("hex"),
    };
  },

  async read(key: string): Promise<Buffer> {
    return readFile(resolvePath(key));
  },

  async delete(key: string): Promise<void> {
    await rm(resolvePath(key), { force: true });
  },
};
