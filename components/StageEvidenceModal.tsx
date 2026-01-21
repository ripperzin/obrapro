import React, { useState, useEffect } from 'react';
import { ProgressStage, STAGE_NAMES, StageEvidence } from '../types';
import AttachmentUpload from './AttachmentUpload';
import { openAttachment } from '../utils/storage';
import { supabase } from '../supabaseClient';

interface StageEvidenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    stage: ProgressStage;
    evidence?: StageEvidence;
    onSave: (photos: string[], notes: string) => Promise<void>;
    readOnly?: boolean;
}

const StageEvidenceModal: React.FC<StageEvidenceModalProps> = ({
    isOpen,
    onClose,
    stage,
    evidence,
    onSave,
    readOnly = false
}) => {
    const [photos, setPhotos] = useState<string[]>([]);
    const [photoUrls, setPhotoUrls] = useState<{ [key: string]: string }>({});
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (evidence) {
            setPhotos(evidence.photos || []);
            setNotes(evidence.notes || '');
        } else {
            setPhotos([]);
            setNotes('');
        }
    }, [evidence, isOpen]);

    // Generate signed URLs for photo previews
    useEffect(() => {
        const generateUrls = async () => {
            const urls: { [key: string]: string } = {};
            for (const photo of photos) {
                if (photo.startsWith('http://') || photo.startsWith('https://')) {
                    urls[photo] = photo;
                } else {
                    try {
                        const { data, error } = await supabase.storage
                            .from('project-documents')
                            .createSignedUrl(photo, 3600);
                        if (!error && data) {
                            urls[photo] = data.signedUrl;
                        }
                    } catch (err) {
                        console.error('Error generating signed URL:', err);
                    }
                }
            }
            setPhotoUrls(urls);
        };
        if (photos.length > 0) {
            generateUrls();
        } else {
            setPhotoUrls({});
        }
    }, [photos]);

    if (!isOpen) return null;

    const handleAddPhoto = (url: string | undefined) => {
        if (url) {
            setPhotos(prev => [...prev, url]);
        }
    };

    const handleRemovePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(photos, notes);
            onClose();
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar evidência.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-500">
                            <i className="fa-solid fa-camera"></i>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Comprovação de Etapa</p>
                            <h3 className="font-black text-white text-lg">{STAGE_NAMES[stage]}</h3>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-6">

                    {/* Photos Grid */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">Fotos da Etapa</label>

                        <div className="grid grid-cols-3 gap-3">
                            {photos.map((photo, index) => {
                                const previewUrl = photoUrls[photo];
                                const isImage = /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(photo);

                                return (
                                    <div key={index} className="aspect-square relative group rounded-xl overflow-hidden border-2 border-slate-600 bg-slate-800">
                                        <button
                                            onClick={() => openAttachment(photo, 'project-documents')}
                                            className="w-full h-full flex items-center justify-center"
                                        >
                                            {isImage && previewUrl ? (
                                                <img
                                                    src={previewUrl}
                                                    alt={`foto da etapa`}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : previewUrl ? (
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <i className="fa-solid fa-file-pdf text-2xl text-red-400 mb-1"></i>
                                                    <span className="text-[10px]">PDF</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <i className="fa-solid fa-spinner fa-spin text-xl mb-1"></i>
                                                    <span className="text-[10px]">Carregando...</span>
                                                </div>
                                            )}
                                        </button>

                                        {/* Overlay text on image */}
                                        {isImage && previewUrl && (
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                                <span className="text-[10px] text-white/80">foto da etapa</span>
                                            </div>
                                        )}

                                        {!readOnly && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemovePhoto(index);
                                                }}
                                                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-md flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                                            >
                                                <i className="fa-solid fa-times text-xs"></i>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Add Button - Styled like photo cards */}
                            {!readOnly && (
                                <div className="aspect-square relative rounded-xl overflow-hidden border-2 border-dashed border-slate-600 bg-slate-800 hover:border-blue-500 transition-colors group">
                                    <AttachmentUpload
                                        className="w-full h-full !p-0"
                                        value={undefined}
                                        onChange={handleAddPhoto}
                                        bucketName="project-documents"
                                        minimal={true}
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2 pointer-events-none">
                                        <span className="text-[10px] text-white/60 group-hover:text-blue-400 transition-colors">anexar foto</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {photos.length === 0 && readOnly && (
                            <p className="text-slate-500 text-sm italic">Nenhuma foto anexada.</p>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Observações</label>
                        <textarea
                            disabled={readOnly}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm focus:border-blue-500 outline-none resize-none h-24"
                            placeholder="Observações sobre a conclusão desta etapa..."
                        />
                    </div>

                </div>

                {/* Footer */}
                {!readOnly && (
                    <div className="p-4 bg-slate-800 border-t border-slate-700 flex justify-end gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition">
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-black uppercase tracking-wider shadow-lg shadow-green-600/20 flex items-center gap-2"
                        >
                            {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                            Salvar Comprovação
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StageEvidenceModal;
