/**
 * The shape of a document as returned to API clients.
 * storageKey is intentionally omitted — it is an internal S3 path
 * that must never be exposed to clients.
 */
export interface DocumentResponse {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  chunkCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
