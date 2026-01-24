import React from 'react';
import ReactDOM from 'react-dom';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger'
}) => {
    if (!isOpen) return null;

    const getVariantStyles = () => {
        switch (variant) {
            case 'danger':
                return {
                    iconBg: 'bg-red-100',
                    iconColor: 'text-red-600',
                    confirmBtn: 'bg-red-600 hover:bg-red-700 shadow-red-200',
                    icon: 'fa-triangle-exclamation'
                };
            case 'warning':
                return {
                    iconBg: 'bg-orange-100',
                    iconColor: 'text-orange-600',
                    confirmBtn: 'bg-orange-600 hover:bg-orange-700 shadow-orange-200',
                    icon: 'fa-circle-exclamation'
                };
            default:
                return {
                    iconBg: 'bg-blue-100',
                    iconColor: 'text-blue-600',
                    confirmBtn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
                    icon: 'fa-circle-info'
                };
        }
    };

    const styles = getVariantStyles();

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border-4 border-white"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-8 text-center">
                    <div className={`w-20 h-20 ${styles.iconBg} rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-short`}>
                        <i className={`fa-solid ${styles.icon} text-3xl ${styles.iconColor}`}></i>
                    </div>

                    <h3 className="text-xl font-black text-slate-800 mb-2 leading-tight">
                        {title}
                    </h3>

                    <p className="text-sm text-slate-500 font-bold leading-relaxed mb-8">
                        {message}
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-slate-100 text-slate-500 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`flex-1 py-3 px-4 ${styles.confirmBtn} text-white rounded-xl font-black text-xs uppercase tracking-wider transition shadow-lg bg-opacity-90 hover:bg-opacity-100`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        modalRoot
    );
};

export default ConfirmModal;
