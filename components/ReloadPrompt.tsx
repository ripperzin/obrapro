import React from 'react';
import ReactDOM from 'react-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error) {
            console.log('SW registration error', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    if (!offlineReady && !needRefresh) return null;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <div className="fixed bottom-0 right-0 p-4 z-[9999]">
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-2xl flex flex-col gap-2 max-w-sm animate-fade-in-up">
                <div className="text-white font-bold text-sm">
                    {offlineReady ? (
                        <span>App pronto para uso offline!</span>
                    ) : (
                        <span>Nova atualização disponível!</span>
                    )}
                </div>
                {needRefresh && (
                    <button
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                        onClick={() => updateServiceWorker(true)}
                    >
                        Atualizar Agora
                    </button>
                )}
                <button
                    className="text-slate-400 hover:text-white text-xs underline"
                    onClick={close}
                >
                    Fechar
                </button>
            </div>
        </div>,
        modalRoot
    );
}

export default ReloadPrompt;
