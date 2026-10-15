'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentStatus } from './document-status-badge';

interface DocumentProcessingStateProps {
  status: DocumentStatus;
  className?: string;
  isReindexing?: boolean;
}

export function DocumentProcessingState({
  status,
  className,
  isReindexing = false,
}: DocumentProcessingStateProps) {
  if (status === 'ready' && !isReindexing) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground',
        className,
      )}
    >
      {isReindexing || status === 'processing' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {isReindexing ? 'Queueing re-index...' : 'Extracting & generating embeddings...'}
          </span>
        </>
      ) : status === 'uploaded' ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />
          <span className="text-blue-700 dark:text-blue-400">
            Waiting in processing queue...
          </span>
        </>
      ) : status === 'failed' ? (
        <span className="text-destructive font-medium">
          Processing stopped. Click re-index to retry.
        </span>
      ) : null}
    </div>
  );
}
