import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-8">
                    <div className="max-w-2xl w-full bg-slate-800 rounded-2xl p-8 border border-red-500/30 shadow-2xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-bug text-3xl text-red-500"></i>
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-white">Ops! Algo deu errado.</h1>
                                <p className="text-slate-400">O aplicativo encontrou um erro inesperado.</p>
                            </div>
                        </div>

                        <div className="bg-black/30 rounded-xl p-4 mb-6 overflow-auto max-h-60 border border-slate-700 font-mono text-sm">
                            <p className="text-red-400 font-bold mb-2">{this.state.error?.toString()}</p>
                            <pre className="text-slate-500 text-xs whitespace-pre-wrap">
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center gap-2"
                        >
                            <i className="fa-solid fa-rotate-right"></i>
                            Recarregar Página
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
