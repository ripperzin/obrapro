import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

interface AttachmentUploadProps {
    value?: string;
    onChange: (url: string | undefined) => void;
    disabled?: boolean;
    className?: string;
}

const AttachmentUpload: React.FC<AttachmentUploadProps> = ({
    value,
    onChange,
    disabled = false,
    className = ''
}) => {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tamanho (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            setError('Arquivo muito grande (máx. 10MB)');
            return;
        }

        // Validar tipo
        const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            setError('Tipo não suportado. Use: JPG, PNG, HEIC ou PDF');
            return;
        }

        setError(null);
        setUploading(true);

        try {
            // Gerar nome único para o arquivo
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `expenses/${fileName}`;

            // Upload para Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('expense-attachments')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // Salvar apenas o path (não a URL pública)
            // O path será usado para gerar signed URLs quando necessário
            onChange(filePath);
        } catch (err: any) {
            console.error('Erro no upload:', err);
            setError(err.message || 'Erro ao fazer upload');
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async () => {
        if (!value) return;

        try {
            // O value agora é diretamente o path do arquivo
            await supabase.storage
                .from('expense-attachments')
                .remove([value]);
        } catch (err) {
            console.error('Erro ao remover arquivo:', err);
        }

        onChange(undefined);
    };

    const isImage = value && /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(value);
    const isPdf = value && /\.pdf$/i.test(value);

    // Estado para URL temporária (signed URL)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Gerar signed URL quando o value mudar
    React.useEffect(() => {
        const generateSignedUrl = async () => {
            if (!value) {
                setPreviewUrl(null);
                return;
            }

            // Se já é uma URL completa (formato antigo), usa diretamente
            if (value.startsWith('http://') || value.startsWith('https://')) {
                setPreviewUrl(value);
                return;
            }

            // Se é um path (formato novo), gera signed URL
            try {
                const { data, error } = await supabase.storage
                    .from('expense-attachments')
                    .createSignedUrl(value, 3600); // URL válida por 1 hora

                if (error) throw error;
                setPreviewUrl(data.signedUrl);
            } catch (err) {
                console.error('Erro ao gerar URL:', err);
                setPreviewUrl(null);
            }
        };

        generateSignedUrl();
    }, [value]);

    return (
        <div className={`${className}`}>
            {/* Botão de Upload */}
            {!value && (
                <div className="relative">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileSelect}
                        disabled={disabled || uploading}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || uploading}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-800 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading ? (
                            <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                <span className="text-sm font-bold">Enviando...</span>
                            </>
                        ) : (
                            <>
                                <i className="fa-solid fa-camera text-lg"></i>
                                <span className="text-sm font-bold">Anexar Foto/PDF</span>
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Preview do Anexo */}
            {value && (
                <div className="relative bg-slate-800 rounded-xl p-3 border border-slate-700">
                    <div className="flex items-center gap-3">
                        {isImage && previewUrl ? (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-700 shrink-0">
                                <img
                                    src={previewUrl}
                                    alt="Anexo"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ) : isPdf ? (
                            <div className="w-16 h-16 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-file-pdf text-2xl text-red-400"></i>
                            </div>
                        ) : (
                            <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-file text-2xl text-slate-400"></i>
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400 font-bold uppercase mb-1">Anexo</p>
                            {previewUrl ? (
                                <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-400 hover:underline truncate block"
                                >
                                    Visualizar anexo →
                                </a>
                            ) : (
                                <span className="text-sm text-slate-500">Gerando link...</span>
                            )}
                        </div>

                        {!disabled && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                className="w-8 h-8 flex items-center justify-center bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition shrink-0"
                                title="Remover anexo"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Erro */}
            {error && (
                <p className="mt-2 text-xs text-red-400 font-bold">
                    <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                    {error}
                </p>
            )}
        </div>
    );
};

export default AttachmentUpload;
