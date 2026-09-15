"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Fournit une confirmation modale (AlertDialog) partagée, à la place de window.confirm().
 * Usage : const confirm = useConfirm(); if (await confirm("Supprimer ?")) { ... }
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; options: ConfirmOptions }>({
    open: false,
    options: { description: '' },
  });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const options = typeof opts === 'string' ? { description: opts } : opts;
    setState({ open: true, options });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={state.open} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-black uppercase tracking-tight">
              {state.options.title || 'Confirmation'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm whitespace-pre-line">
              {state.options.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)} className="rounded-xl">
              {state.options.cancelLabel || 'Annuler'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={
                state.options.variant === 'destructive'
                  ? 'rounded-xl bg-red-600 hover:bg-red-700 focus:ring-red-500'
                  : 'rounded-xl'
              }
            >
              {state.options.confirmLabel || 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm() doit être utilisé à l\'intérieur d\'un <ConfirmProvider>.');
  }
  return ctx;
}
