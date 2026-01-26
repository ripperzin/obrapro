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
        <div className="relative group">
            {/* Main Card Area */}
            <div className={`
                relative overflow-hidden rounded-2xl transition-all duration-300
                ${isScanning
                    ? 'bg-slate-800 border-2 border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.2)]'
                    : 'bg-slate-800 border border-slate-700 hover:border-slate-500 hover:shadow-lg'
                }
            `}>

                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-2xl rounded-bl-full pointer-events-none" />

                <div className="p-5 flex flex-col items-center gap-4 relative z-10">

                    {/* Header / Status */}
                    <div className="text-center space-y-1">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center justify-center gap-2">
                            <i className="fa-solid fa-receipt text-blue-400"></i>
                            Scanner Inteligente
                        </h3>
                        <p className="text-[10px] text-slate-400 font-medium max-w-[200px] mx-auto leading-relaxed">
                            {isScanning ? 'Analisando recibo com IA...' : 'Fotografe o comprovante para preencher tudo automaticamente'}
                        </p>
                    </div>

                    {/* Actions Grid */}
                    {!isScanning && (
                        <div className="flex gap-3 w-full">
                            <button
                                type="button"
                                onClick={() => cameraInputRef.current?.click()}
                                className="flex-1 group/btn relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 p-4 rounded-xl flex flex-col items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
                            >
                                <div className="p-2 bg-white/10 rounded-full group-hover/btn:scale-110 transition-transform">
                                    <Camera className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-[10px] font-bold text-white uppercase tracking-wide">Câmera</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => galleryInputRef.current?.click()}
                                className="flex-1 group/btn bg-slate-700 hover:bg-slate-600 p-4 rounded-xl flex flex-col items-center gap-2 transition-all active:scale-95 border border-slate-600 hover:border-slate-500"
                            >
                                <div className="p-2 bg-slate-800 rounded-full group-hover/btn:scale-110 transition-transform">
                                    <Upload className="w-5 h-5 text-slate-300" />
                                </div>
                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Galeria</span>
                            </button>
                        </div>
                    )}

                    {/* Loading State */}
                    {isScanning && (
                        <div className="w-full py-4 flex flex-col items-center gap-3">
                            <div className="relative">
                                <div className="w-12 h-12 border-4 border-slate-700 border-t-green-500 rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <i className="fa-solid fa-bolt text-green-500 text-xs animate-pulse"></i>
                                </div>
                            </div>
                            <div className="flex gap-1 items-center">
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce"></span>
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce delay-100"></span>
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce delay-200"></span>
                            </div>
                        </div>
                    )}

                    {/* Error Feedback */}
                    {error && (
                        <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 animate-shake">
                            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                            <span className="text-xs text-red-200 font-medium">{error}</span>
                        </div>
                    )}
                </div>

                {/* Hidden Inputs */}
                <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    ref={cameraInputRef}
                    onChange={handleFileChange}
                />
                <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    ref={galleryInputRef}
                    onChange={handleFileChange}
                />
            </div>

            {/* Bottom Glow */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-blue-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
    );
};
