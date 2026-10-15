'use client';

import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, FileText, File, RotateCw, Trash2, Loader2 } from 'lucide-react';
import { Document } from '../api';
import { DocumentStatusBadge } from './document-status-badge';

interface DocumentRowProps {
  document: Document;
  isDeleting: boolean;
  isReindexing: boolean;
  onPreview: (doc: Document) => void;
  onReindex: (doc: Document) => void;
  onDeleteClick: (doc: Document) => void;
}

export function DocumentRow({
  document,
  isDeleting,
  isReindexing,
  onPreview,
  onReindex,
  onDeleteClick,
}: DocumentRowProps) {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') {
      return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
    }
    return <File className="h-4 w-4 shrink-0 text-blue-500" />;
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return dateString;
    }
  };

  const isBusy = isDeleting || isReindexing || document.status === 'processing';

  return (
    <TableRow className="group transition-colors hover:bg-muted/50">
      {/* Filename */}
      <TableCell className="font-medium">
        <div className="flex items-center gap-2.5 max-w-[260px] sm:max-w-[340px]">
          {getFileIcon(document.mimeType)}
          <span
            className="truncate text-foreground text-sm font-medium"
            title={document.filename}
          >
            {document.filename}
          </span>
        </div>
      </TableCell>

      {/* Type */}
      <TableCell>
        <span
          className={`inline-flex items-center text-[11px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${
            document.mimeType === 'application/pdf'
              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          }`}
        >
          {document.mimeType === 'application/pdf' ? 'PDF' : 'TXT'}
        </span>
      </TableCell>

      {/* File Size */}
      <TableCell className="text-muted-foreground text-sm font-mono text-xs">
        {formatSize(document.size)}
      </TableCell>

      {/* Status & Chunks */}
      <TableCell>
        <DocumentStatusBadge
          status={document.status}
          chunkCount={document.chunkCount}
        />
      </TableCell>

      {/* Upload Date */}
      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
        {formatDate(document.createdAt)}
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Preview button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
            disabled={document.status === 'failed'}
            onClick={() => onPreview(document)}
            title={
              document.status === 'failed'
                ? 'Preview unavailable for failed document'
                : 'Preview extracted text'
            }
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">Preview</span>
          </Button>

          {/* Re-index button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
            disabled={isBusy}
            onClick={() => onReindex(document)}
            title={
              isReindexing || document.status === 'processing'
                ? 'Indexing in progress...'
                : 'Re-index document (re-extract, chunk, and embed)'
            }
          >
            {isReindexing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
            <span className="sr-only">Re-index</span>
          </Button>

          {/* Delete button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={isDeleting}
            onClick={() => onDeleteClick(document)}
            title="Delete document"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin text-destructive" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
