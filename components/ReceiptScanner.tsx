import React, { useState, useRef } from 'react';
import { Camera, Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { parseReceiptImage, ReceiptData } from '../lib/gemini';

interface ReceiptScannerProps {
    onScanComplete: (data: ReceiptData, file: File) => void;
}

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({ onScanComplete }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        setError(null);

        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;

                try {
                    const data = await parseReceiptImage(base64String);
                    onScanComplete(data, file);
                } catch (err: any) {
                    console.error("OCR Error:", err);
                    setError(err.message || "Erro ao processar recibo.");
                } finally {
                    setIsScanning(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            setError("Erro ao processar imagem.");
            setIsScanning(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50 items-center justify-center text-center hover:bg-gray-100 transition-colors">

            {/* Input para Câmera (força environment) */}
            <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={cameraInputRef}
                onChange={handleFileChange}
            />

            {/* Input para Galeria (sem capture) */}
            <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                ref={galleryInputRef}
                onChange={handleFileChange}
            />

            {isScanning ? (
                <div className="flex flex-col items-center gap-2 animate-pulse">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-600">Lendo recibo com IA...</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3 w-full">
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600"
                        >
                            <div className="p-3 bg-white rounded-full shadow-sm">
                                <Camera className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-medium">Câmera</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600"
                        >
                            <div className="p-3 bg-white rounded-full shadow-sm">
                                <Upload className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-medium">Galeria</span>
                        </button>
                    </div>

                    <p className="text-xs text-gray-400">Tire foto do recibo para preencher automático</p>

                    {error && (
                        <div className="flex items-center gap-1 text-red-500 text-xs mt-1">
                            <XCircle className="w-3 h-3" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
