import React, { useState, useRef, useEffect } from 'react';
import { useProjectBrain } from '../hooks/useProjectBrain';
import ReactDOM from 'react-dom';
import { ChatMessage } from '../lib/claude';

interface AICopilotProps {
    currentProjectId?: string | null;
    onAction?: (action: string, data?: any) => void;
    triggerVoice?: number; // Counter to trigger external voice start
}

const AICopilot: React.FC<AICopilotProps> = ({ currentProjectId, onAction, triggerVoice }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'Olá! Sou o Copiloto ObraPro. Como posso ajudar você hoje?' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isListening, setIsListening] = useState(false);
    const { loading, processMessage } = useProjectBrain();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    // Speech Recognition Setup
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'pt-BR';
            recognition.interimResults = false;

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                if (transcript) {
                    setInputValue(transcript);
                    // Opcional: Enviar automaticamente
                    handleSendMessage(transcript);
                }
            };
            recognitionRef.current = recognition;
        }
    }, []);

    useEffect(() => {
        if (triggerVoice && triggerVoice > 0) {
            setIsOpen(true);
            // Wait for modal to open and recognition to be ready
            setTimeout(() => {
                if (!isListening) {
                    toggleListening();
                }
            }, 300);
        }
    }, [triggerVoice]);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            recognitionRef.current?.start();
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim() || loading) return;

        setMessages(prev => [...prev, { role: 'user', content: text }]);
        const historyForAI = [...messages];
        setInputValue('');

        const response = await processMessage(text, historyForAI, currentProjectId);
        setMessages(prev => [...prev, { role: 'assistant', content: response.text }]);

        if (response.action && response.action.type !== 'NONE' && onAction) {
            setTimeout(() => {
                onAction(response.action!.type, response.action!.data);
            }, 1000);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendMessage(inputValue);
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <>
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="hidden md:flex fixed bottom-24 right-4 md:bottom-24 md:right-8 z-[90] w-14 h-14 rounded-full flex-col items-center justify-center transition-all duration-300 
                               bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-400
                               shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5),inset_0_2px_4px_rgba(255,255,255,0.3),inset_0_-4px_6px_rgba(0,0,0,0.2)]
                               hover:-translate-y-2 hover:shadow-indigo-500/40 active:scale-95 animate-fade-in
                               border border-indigo-400/30 group"
                >
                    <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" fill="currentColor">
                        <path d="M12 3L14.5 8.5L20 11L14.5 13.5L12 19L9.5 13.5L4 11L9.5 8.5L12 3Z" className="animate-pulse" />
                        <path d="M19 3L20 5.5L22.5 6.5L20 7.5L19 10L18 7.5L15.5 6.5L18 5.5L19 3Z" />
                        <path d="M5 14L6 16.5L8.5 17.5L6 18.5L5 21L4 18.5L1.5 17.5L4 16.5L5 14Z" />
                    </svg>

                    {/* Pulse Effect */}
                    <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping pointer-events-none"></div>
                </button>
            )}

            {isOpen && (
                <div className="fixed bottom-24 right-4 md:bottom-24 md:right-8 z-[90] w-[90vw] md:w-[350px] h-[500px] max-h-[70vh] glass border border-slate-600 rounded-2xl flex flex-col shadow-2xl animate-fade-in-up overflow-hidden">
                    <div className="p-4 bg-slate-900/90 border-b border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                <i className="fa-solid fa-robot text-white text-xs"></i>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Copiloto ObraPro</h3>
                                <div className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                    <span className="text-[10px] text-slate-400">Online</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-slate-400 hover:text-white transition"
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-slate-700 text-slate-200 rounded-bl-none'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-700 p-3 rounded-2xl rounded-bl-none flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSubmit} className="p-3 bg-slate-900/90 border-t border-slate-700 flex flex-col gap-2">
                        {isListening && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-lg animate-pulse">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                <span className="text-[10px] text-red-400 font-bold uppercase">Escutando você...</span>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={toggleListening}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isListening
                                    ? 'bg-red-500 text-white animate-pulse'
                                    : 'bg-slate-800 text-slate-400 hover:text-blue-400 border border-slate-700'
                                    }`}
                            >
                                <i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'} text-xs`}></i>
                            </button>
                            <input
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                placeholder="Pergunte sobre sua obra..."
                                className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                type="submit"
                                disabled={loading || !inputValue.trim()}
                                className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                <i className="fa-solid fa-paper-plane text-xs"></i>
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>,
        modalRoot
    );
};

export default AICopilot;
