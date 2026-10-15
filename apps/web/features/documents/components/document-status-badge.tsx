'use client';

import { CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

interface DocumentStatusBadgeProps {
  status: DocumentStatus;
  chunkCount?: number;
  className?: string;
}

export function DocumentStatusBadge({
  status,
  chunkCount,
  className,
}: DocumentStatusBadgeProps) {
  switch (status) {
    case 'ready':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
            className,
          )}
          title="Indexed and ready for retrieval"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>
            Ready
            {typeof chunkCount === 'number' && chunkCount > 0
              ? ` • ${chunkCount} chunk${chunkCount === 1 ? '' : 's'}`
              : ''}
          </span>
        </span>
      );

    case 'processing':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 animate-pulse',
            className,
          )}
          title="Extracting text, chunking, and generating vector embeddings"
        >
          <Loader2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
          <span>Processing...</span>
        </span>
      );

    case 'uploaded':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
            className,
          )}
          title="Queued for indexing"
        >
          <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>Queued</span>
        </span>
      );

    case 'failed':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
            className,
          )}
          title="Indexing failed. Try re-indexing."
        >
          <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          <span>Failed</span>
        </span>
      );

    default:
      return null;
  }
}
