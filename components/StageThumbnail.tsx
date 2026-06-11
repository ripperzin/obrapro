import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface StageThumbnailProps {
    photoPath?: string;
    className?: string;
    alt?: string;
    placeholderIcon?: string;
    // URL já assinada (ex.: vinda da edge function no Portal do Investidor).
    // Se informada, usamos direto e NÃO tocamos no Storage como cliente.
    signedUrl?: string | null;
}

const StageThumbnail: React.FC<StageThumbnailProps> = ({
    photoPath,
    className = "",
    alt = "Stage evidence",
    placeholderIcon = "fa-image",
    signedUrl
}) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        if (!photoPath) {
            setImageUrl(null);
            return;
        }

        // URL pré-assinada fornecida pelo chamador: usa direto.
        if (signedUrl) {
            setImageUrl(signedUrl);
            return;
        }

        const getUrl = async () => {
            // Se já for URL completa
            if (photoPath.startsWith('http')) {
                if (isMounted) setImageUrl(photoPath);
                return;
            }

            try {
                const { data } = await supabase.storage
                    .from('project-documents') // Assumindo bucket padrão
                    .createSignedUrl(photoPath, 3600); // 1 hora

                if (data && isMounted) {
                    setImageUrl(data.signedUrl);
                }
            } catch (err) {
                console.error("Error signing url:", err);
            }
        };

        getUrl();

        return () => { isMounted = false; };
    }, [photoPath, signedUrl]);

    if (imageUrl) {
        return (
            <img
                src={imageUrl}
                alt={alt}
                className={`${className} object-cover`}
            />
        );
    }

    return (
        <div className={`${className} bg-slate-800 flex items-center justify-center border border-slate-700`}>
            <i className={`fa-solid ${placeholderIcon} text-slate-500 text-opacity-50`}></i>
        </div>
    );
};

export default StageThumbnail;
