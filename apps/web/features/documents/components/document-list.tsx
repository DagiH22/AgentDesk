'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileText, RefreshCw } from 'lucide-react';
import {
  useDocuments,
  useDeleteDocument,
  useReindexDocument,
} from '../hooks/use-documents';
import { Document } from '../api';
import { toast } from 'sonner';
import { DocumentPreviewModal } from './document-preview-modal';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';
import { DocumentRow } from './document-row';
import { LoadingSpinner } from '@/components/feedback/loading-spinner';
import { ErrorMessage } from '@/components/feedback/error-message';
import { EmptyState } from '@/components/feedback/empty-state';

export function DocumentList() {
  const { data: documents, isLoading, isError, error, refetch } = useDocuments();
  const deleteMutation = useDeleteDocument();
  const reindexMutation = useReindexDocument();

  const [previewDoc, setPreviewDoc] = useState<{ id: string; filename: string } | null>(null);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  const handleDeleteConfirm = () => {
    if (!docToDelete) return;

    const { id, filename } = docToDelete;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`"${filename}" was deleted successfully.`);
        setDocToDelete(null);
      },
      onError: (err: any) => {
        const message =
          err?.response?.data?.message || err?.message || 'Failed to delete document.';
        toast.error(message);
      },
    });
  };

  const handleReindex = (doc: Document) => {
    setReindexingId(doc.id);
    reindexMutation.mutate(doc.id, {
      onSuccess: (data) => {
        toast.success(
          data?.message || `Re-indexing job queued for "${doc.filename}".`,
        );
        setReindexingId(null);
      },
      onError: (err: any) => {
        const message =
          err?.response?.data?.message || err?.message || 'Failed to queue re-indexing.';
        toast.error(message);
        setReindexingId(null);
      },
    });
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 rounded-xl border bg-card text-card-foreground shadow-xs">
        <LoadingSpinner size={32} />
        <p className="mt-4 text-sm text-muted-foreground font-medium animate-pulse">
          Loading knowledge base documents...
        </p>
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="space-y-4">
        <ErrorMessage
          title="Failed to Load Documents"
          message={
            (error as any)?.response?.data?.message ||
            error?.message ||
            'Could not retrieve documents from the server. Please check your connection and try again.'
          }
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // 3. Empty State
  if (!documents || documents.length === 0) {
    return (
      <EmptyState
        title="No documents yet"
        description="Upload your company's PDFs or plain text documents on the left to extract text, chunk content, and generate vector embeddings."
        icon={<FileText className="h-8 w-8 text-muted-foreground" />}
      />
    );
  }

  const processingCount = documents.filter(
    (d) => d.status === 'processing' || d.status === 'uploaded',
  ).length;

  return (
    <div className="space-y-3">
      {/* Active Processing Indicator */}
      {processingCount > 0 && (
        <div className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3.5 py-2 rounded-lg border border-amber-200 dark:border-amber-800/50">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="font-medium">
              {processingCount} document{processingCount === 1 ? ' is' : 's are'} currently being processed in the background.
            </span>
          </div>
          <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
            Auto-refreshing
          </span>
        </div>
      )}

      {/* Documents Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[35%] font-semibold text-xs tracking-wider uppercase">Filename</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider uppercase">Type</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider uppercase">Size</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider uppercase">Uploaded</TableHead>
              <TableHead className="text-right font-semibold text-xs tracking-wider uppercase pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                isDeleting={deleteMutation.isPending && docToDelete?.id === doc.id}
                isReindexing={reindexingId === doc.id}
                onPreview={(d) => setPreviewDoc({ id: d.id, filename: d.filename })}
                onReindex={handleReindex}
                onDeleteClick={(d) => setDocToDelete(d)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Preview Sheet Modal */}
      <DocumentPreviewModal
        isOpen={!!previewDoc}
        documentId={previewDoc?.id || null}
        filename={previewDoc?.filename || null}
        onClose={() => setPreviewDoc(null)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={!!docToDelete}
        filename={docToDelete?.filename || null}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDocToDelete(null)}
      />
    </div>
  );
}
