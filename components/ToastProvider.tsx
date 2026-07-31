import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

/**
 * Avisos padrão do app ("toast"): aparecem no TOPO-CENTRO, somem sozinhos e têm
 * a cara do ObraPro. Substituem o alert() cinza do navegador.
 *
 *   const toast = useToast();
 *   toast.success('Despesa salva');
 *   toast.error('Não consegui salvar');
 *   toast.info('Gere o cronograma primeiro');
 */
type ToastVariant = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; variant: ToastVariant; }

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const noop: ToastApi = { success: () => {}, error: () => {}, info: () => {} };
const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => useContext(ToastContext) ?? noop;

const VARIANT: Record<ToastVariant, { icon: string; border: string; text: string }> = {
  success: { icon: 'fa-circle-check', border: 'border-emerald-500/50', text: 'text-emerald-400' },
  error:   { icon: 'fa-circle-exclamation', border: 'border-rose-500/60', text: 'text-rose-400' },
  info:    { icon: 'fa-circle-info', border: 'border-blue-500/50', text: 'text-blue-400' },
};

// Erros ficam mais tempo na tela (o usuário precisa ler); sucesso some rápido.
const DURATION: Record<ToastVariant, number> = { success: 3000, error: 5000, info: 4000 };

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const tm = timers.current[id];
    if (tm) { clearTimeout(tm); delete timers.current[id]; }
  }, []);

  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, variant }]);
    timers.current[id] = setTimeout(() => dismiss(id), DURATION[variant]);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  }), [push]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const overlay = typeof document !== 'undefined'
    ? ReactDOM.createPortal(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 w-full max-w-md px-4 pointer-events-none">
          {toasts.map((t) => {
            const v = VARIANT[t.variant];
            return (
              <div
                key={t.id}
                onClick={() => dismiss(t.id)}
                role="status"
                className={`pointer-events-auto w-full cursor-pointer bg-slate-900/95 backdrop-blur border ${v.border} rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 animate-fade-in`}
              >
                <i className={`fa-solid ${v.icon} ${v.text} text-lg shrink-0`}></i>
                <p className="text-sm font-bold text-white leading-snug flex-1">{t.message}</p>
                <i className="fa-solid fa-xmark text-slate-500 text-xs shrink-0"></i>
              </div>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {overlay}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
