/**
 * Compresses an image file using the browser's Canvas API.
 * 
 * @param file The original image file.
 * @param maxWidth The maximum width of the output image (default: 1920px).
 * @param quality The JPEG quality (0 to 1, default: 0.7).
 * @returns A Promise that resolves to the compressed Blob (or the original file if compression fails/isn't needed).
 */
export const compressImage = async (
    file: File,
    maxWidth = 1920,
    quality = 0.7
): Promise<File> => {
    // Se não for imagem, retorna o arquivo original
    if (!file.type.startsWith('image/')) {
        return file;
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;

            img.onload = () => {
                // Calcular novas dimensões mantendo proporção
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                // Criar canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file); // Fallback para arquivo original
                    return;
                }

                // Desenhar imagem redimensionada
                ctx.drawImage(img, 0, 0, width, height);

                // Converter para blob/arquivo comprimido
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            resolve(file);
                            return;
                        }

                        // Criar novo arquivo a partir do blob
                        // Mantendo o nome original mas garantindo extensão jpg/jpeg pois canvas.toBlob padrão é png se não especificar, 
                        // mas aqui estamos pedindo image/jpeg
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });

                        // Verificar se a compressão valeu a pena
                        if (compressedFile.size < file.size) {
                            console.log(`Imagem comprimida: ${(file.size / 1024).toFixed(2)}KB -> ${(compressedFile.size / 1024).toFixed(2)}KB`);
                            resolve(compressedFile);
                        } else {
                            resolve(file); // Se ficou maior (raro), usa original
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = (err) => {
                console.error('Erro ao carregar imagem para compressão', err);
                resolve(file);
            };
        };

        reader.onerror = (err) => {
            console.error('Erro ao ler arquivo', err);
            resolve(file);
        };
    });
};
