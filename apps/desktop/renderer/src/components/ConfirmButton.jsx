import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useApp } from '../App.jsx';

// Przycisk z potwierdzeniem (zastępuje natywny confirm()).
export default function ConfirmButton({ children, onConfirm, message, title, variant = 'default', size = 'sm', confirmLabel, className }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try { await onConfirm(); setOpen(false); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>{children}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title || t.AreYouSure}</DialogTitle>
            {message && <DialogDescription>{message}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t.Cancel}</Button>
            <Button variant={variant === 'default' ? 'default' : variant} disabled={busy} onClick={go}>
              {confirmLabel || t.Save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
