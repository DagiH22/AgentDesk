import { apiClient } from '@/lib/api/client';

/**
 * Document as returned by the API.
 * storageKey is intentionally absent — it is an internal S3 path
 * and must not be exposed to or used by the frontend.
 */
export interface Document {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const getDocuments = (): Promise<Document[]> => {
  return apiClient.get<Document[]>('/documents');
};

export const uploadDocument = ({
  file,
  onProgress,
}: {
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<Document> => {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient.post<Document>('/documents', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
      }
    },
  });
};

export const deleteDocument = (id: string): Promise<void> => {
  return apiClient.delete<void>(`/documents/${id}`);
};

export const reindexDocument = (
  id: string,
): Promise<{ queued: boolean; message: string }> => {
  return apiClient.post<{ queued: boolean; message: string }>(`/documents/${id}/reindex`);
};

export const getDocumentPreview = (id: string): Promise<{ text: string }> => {
  return apiClient.get<{ text: string }>(`/documents/${id}/preview`);
};
