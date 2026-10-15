'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  filename: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationDialog({
  isOpen,
  filename,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isDeleting && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Delete Document</DialogTitle>
              <DialogDescription className="mt-1">
                This action is destructive and cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-foreground break-all">
            {filename || 'this document'}
          </span>
          ? This will permanently delete the file from storage and remove all
          associated text chunks and vector embeddings from the database.
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Document'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
