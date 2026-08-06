import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal';

/**
 * Confirmação padrão do app: a janelinha bonita do ObraPro no lugar do
 * "Tem certeza?" cinza do navegador (window.confirm). Funciona com promise,
 * então dá pra usar direto num if:
 *
 *   const confirm = useConfirm();
 *   if (await confirm('Excluir esta despesa?')) { ...apaga... }
 *
 *   // com opções (título, botão, cor):
 *   const ok = await confirm({
 *     title: 'Excluir obra?',
 *     message: 'Isso apaga tudo e não volta.',
 *     confirmText: 'Sim, excluir',
 *     variant: 'danger',
 *   });
 *   if (!ok) return;
 */
type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

type ConfirmFn = (opts: string | ConfirmOptions) => Promise<boolean>;

// Fora de um provider (ou em teste) cai no confirm nativo pra nunca travar a ação.
const fallback: ConfirmFn = (opts) => {
  const message = typeof opts === 'string' ? opts : opts.message;
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : true);
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => useContext(ConfirmContext) ?? fallback;

interface PendingConfirm extends Required<Omit<ConfirmOptions, 'message'>> {
  message: string;
  resolve: (value: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback<ConfirmFn>((opts) => {
    const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      // Se já havia um aberto (raro), cancela o anterior antes de trocar.
      if (pendingRef.current) pendingRef.current.resolve(false);
      setPending({
        title: o.title ?? 'Tem certeza?',
        message: o.message,
        confirmText: o.confirmText ?? 'Confirmar',
        cancelText: o.cancelText ?? 'Cancelar',
        variant: o.variant ?? 'danger',
        resolve,
      });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    // O ConfirmModal dispara onConfirm() E onClose() no botão de confirmar; zerar
    // o ref aqui faz a segunda chamada virar no-op (a promise só resolve uma vez).
    const cur = pendingRef.current;
    pendingRef.current = null;
    cur?.resolve(value);
    setPending(null);
  }, []);

  const api = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <ConfirmModal
        isOpen={!!pending}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        confirmText={pending?.confirmText}
        cancelText={pending?.cancelText}
        variant={pending?.variant}
      />
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
