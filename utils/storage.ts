import { supabase } from '../supabaseClient';
import { compressImage } from './imageCompression';

/**
 * Faz upload de um arquivo para o Storage
 * @param file Arquivo para upload
 * @param bucketName Nome do bucket
 * @returns Path do arquivo salvo ou null se falhar
 */
export const uploadFile = async (file: File, bucketName: string = 'expense-attachments'): Promise<string | null> => {
    try {
        // Tentar comprimir se for imagem
        let fileToUpload = file;
        if (file.type.startsWith('image/')) {
            try {
                fileToUpload = await compressImage(file);
            } catch (err) {
                console.warn('Falha na compressão, usando arquivo original', err);
            }
        }

        // Gerar nome único
        const fileExt = fileToUpload.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = bucketName === 'expense-attachments' ? `expenses/${fileName}` : `docs/${fileName}`;

        const { error } = await supabase.storage
            .from(bucketName)
            .upload(filePath, fileToUpload);

        if (error) throw error;
        return filePath;

    } catch (err) {
        console.error('Erro no upload:', err);
        return null;
    }
};

/**
 * Gera uma URL temporária (signed URL) para acessar um arquivo privado no Storage
 * @param path Path do arquivo no bucket (ex: "expenses/123_abc.jpg")
 * @param bucketName Nome do bucket (padrão: 'expense-attachments')
 * @param expiresIn Tempo de expiração em segundos (padrão: 1 hora)
 * @returns URL assinada ou null se falhar
 */
export const getSignedUrl = async (path: string, bucketName: string = 'expense-attachments', expiresIn: number = 3600): Promise<string | null> => {
    if (!path) return null;

    try {
        const { data, error } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(path, expiresIn);

        if (error) throw error;
        return data.signedUrl;
    } catch (err) {
        console.error('Erro ao gerar URL assinada:', err);
        return null;
    }
};

/**
 * Abre um arquivo do Storage em uma nova aba
 * Detecta automaticamente se é uma URL pública antiga ou um path novo
 * @param pathOrUrl Path do arquivo ou URL completa
 * @param bucketName Nome do bucket (opcional, usado se for um path)
 */
export const openAttachment = async (pathOrUrl: string, bucketName: string = 'expense-attachments'): Promise<void> => {
    if (!pathOrUrl) {
        alert('Anexo não encontrado.');
        return;
    }

    let finalUrl: string;

    // Se já é uma URL completa (formato antigo), usa diretamente
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        finalUrl = pathOrUrl;
    } else {
        // Se é um path (formato novo), gera signed URL
        const url = await getSignedUrl(pathOrUrl, bucketName);
        if (!url) {
            alert('Erro ao gerar link do anexo. Tente novamente.');
            return;
        }
        finalUrl = url;
    }

    // Detectar Safari
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isSafari) {
        // Safari: redireciona na mesma aba (user volta pelo botão voltar)
        window.location.href = finalUrl;
    } else {
        // Outros browsers: abre em nova aba
        const link = document.createElement('a');
        link.href = finalUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
