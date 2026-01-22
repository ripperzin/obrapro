import React, { useState, useEffect, useRef } from 'react';

interface VoiceAssistantProps {
    onNavigate: (tab: string) => void;
    onAction: (action: string, data?: any) => void;
}

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ onNavigate, onAction }) => {
    const [isListening, setIsListening] = useState(false);
    const [feedback, setFeedback] = useState('');

    // Refs for state accessible inside event listeners
    const isListeningRef = useRef(false);
    const recognitionRef = useRef<any>(null);
    const silenceTimerRef = useRef<any>(null);
    const accumulatedTextRef = useRef<string>('');
    const hasCentavosRef = useRef<boolean>(false);

    // Configure standard wait time for silence (in ms)
    const SILENCE_TIMEOUT = 2000;

    const startListening = () => {
        setIsListening(true);
        isListeningRef.current = true;
        setFeedback('Ouvindo...');
        accumulatedTextRef.current = '';
        hasCentavosRef.current = false;

        if (recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error("Error starting recognition:", e);
            }
        }
    };

    const stopListening = (manual = false) => {
        setIsListening(false);
        isListeningRef.current = false;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.lang = 'pt-BR';
            recognition.interimResults = true;

            recognition.onstart = () => {
                if (!isListeningRef.current) {
                    setIsListening(true);
                    isListeningRef.current = true;
                }
            };

            recognition.onend = () => {
                if (accumulatedTextRef.current.trim()) {
                    processCommand(accumulatedTextRef.current);
                }

                setIsListening(false);
                isListeningRef.current = false;
                setFeedback('');
            };

            recognition.onresult = (event: any) => {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

                let finalChunk = '';
                let interimChunk = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const t = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalChunk += t;
                    } else {
                        interimChunk += t;
                    }

                    if (t.toLowerCase().includes('centavos')) {
                        hasCentavosRef.current = true;
                    }
                }

                if (finalChunk) {
                    accumulatedTextRef.current += ' ' + finalChunk;
                }

                const currentDisplay = (accumulatedTextRef.current + ' ' + interimChunk).trim();
                setFeedback(currentDisplay ? `... ${currentDisplay.slice(-30)}` : 'Ouvindo...');

                silenceTimerRef.current = setTimeout(() => {
                    recognition.stop();
                }, SILENCE_TIMEOUT);
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error', event.error);
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                setFeedback('Erro. Tente novamente.');
                setIsListening(false);
                isListeningRef.current = false;
            };

            recognitionRef.current = recognition;
        } else {
            setFeedback('Navegador não suporta voz.');
        }
    }, []);

    const processCommand = (text: string) => {
        text = text.trim();
        if (!text) return;

        console.log('Voice Command Raw:', text);
        setFeedback('Processando...');

        const lowerText = text.toLowerCase();

        // 1. Navigation
        if (lowerText.includes('início') || lowerText.includes('geral') || lowerText.includes('home')) {
            onNavigate('general');
            return;
        } else if (lowerText.includes('obras') || lowerText.includes('projetos') || lowerText.includes('lista')) {
            onNavigate('projects');
            return;
        } else if (lowerText.includes('usuários') || lowerText.includes('admin')) {
            onNavigate('users');
            return;
        }
        // 2. Diary
        else if (lowerText.includes('diário') || lowerText.includes('registro') || lowerText.includes('relatório')) {
            onAction('ADD_DIARY', { text });
            return;
        }
        // 3. Expenses
        else if (
            lowerText.includes('despesa') ||
            lowerText.includes('gasto') ||
            lowerText.includes('custo') ||
            lowerText.startsWith('adicionar') ||
            lowerText.startsWith('comprar') ||
            lowerText.startsWith('lançar')
        ) {
            // --- Parsing Logic ---
            let cleanText = text.replace(/(\d)\s+e\s+(?=\d)/gi, '$1,');
            cleanText = cleanText.replace(/\s(reais|real|r\$)\s/gi, ' ');

            const candidates = cleanText.match(/[\d\.,]+\d/g);

            let estimatedValue = 0;

            if (candidates && candidates.length > 0) {
                const rawVal = candidates[candidates.length - 1];

                let numStr = rawVal;
                let isDecimal = false;

                if (numStr.includes(',')) {
                    numStr = numStr.replace(/\./g, '').replace(',', '.');
                    isDecimal = true;
                } else {
                    numStr = numStr.replace(/\./g, '');
                }

                let val = parseFloat(numStr);

                if (hasCentavosRef.current && !isDecimal && !isNaN(val)) {
                    val = val / 100.0;
                }

                if (!isNaN(val)) estimatedValue = val;
            }

            // --- Description Cleanup ---
            let description = text;

            // 1. Remove command keywords
            const prefixRegex = /^(adicionar|nova despesa|lançar|gastei|comprar|novo gasto|adicionar despesa)\s+/i;
            description = description.replace(prefixRegex, '');

            // 2. Remove currency words (reais, centavos, etc)
            description = description.replace(/\b(valor|reais|real|centavos|vírgula)\b/gi, '');

            // 3. AGGRESSIVE NUMBER REMOVAL at END of string
            // Matches: "10.500", "10.500 e 50", "50", "10,50" at the very end.
            // (\d+[\.,]?\d*)   -> Main number
            // (\s*(?:e|vírgula|,)\s*\d+)? -> Optional second part (" e 50")
            // \s*$ -> Must be at end
            const endNumberRegex = /(\d+[\.,]?\d*)(\s*(?:e|vírgula|,)\s*\d+)?\s*$/i;
            description = description.replace(endNumberRegex, '');

            // Double check: if still has " e " pending at end
            description = description.replace(/\s+e\s*$/i, '');
            description = description.replace(/\s+/g, ' ').trim();

            onAction('ADD_EXPENSE', { text, estimatedValue, description });
        } else {
            setFeedback(`Não entendi: "${text}"`);
        }
    };

    return (
        <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-2">
            {(isListening || feedback) && (
                <div className="bg-slate-800 border border-slate-700 text-white px-4 py-2 rounded-xl shadow-xl mb-2 animate-fade-in max-w-[250px] text-right z-[100]">
                    <p className="text-xs font-bold whitespace-pre-wrap">{feedback}</p>
                    {isListening && (
                        <div className="flex justify-end gap-1 mt-1">
                            <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-xs text-green-400 ml-1">Ouvindo... (2s silêncio envia)</span>
                        </div>
                    )}
                </div>
            )}

            <button
                onClick={() => isListening ? stopListening(true) : startListening()}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${isListening
                    ? 'bg-red-500 animate-pulse ring-4 ring-red-500/30'
                    : 'bg-blue-600 hover:bg-blue-500'
                    }`}
            >
                <i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'} text-white text-xl`}></i>
            </button>
        </div>
    );
};

export default VoiceAssistant;
