import React, { useState, useMemo } from 'react';
import { Project, LogEntry } from '../types';

interface AuditPageProps {
    projects: Project[];
}

const AuditPage: React.FC<AuditPageProps> = ({ projects }) => {
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Flatten all logs from all projects if 'all' is selected, otherwise filter
    const allLogs = useMemo(() => {
        let logs: (LogEntry & { projectName: string })[] = [];

        projects.forEach(p => {
            if (selectedProjectId === 'all' || p.id === selectedProjectId) {
                if (p.logs) {
                    logs = [...logs, ...p.logs.map(l => ({ ...l, projectName: p.name }))];
                }
            }
        });

        return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [projects, selectedProjectId]);

    const filteredLogs = allLogs.filter(log =>
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.field && log.field.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Central de Auditoria</h2>
                    <p className="text-slate-400 text-sm">Monitore todas as alterações realizadas no sistema</p>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    {/* Project Selector */}
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    >
                        <option value="all">Todas as Obras</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    {/* Search Input */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <i className="fa-solid fa-search text-slate-500"></i>
                        </div>
                        <input
                            type="text"
                            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                            placeholder="Buscar ação, usuário..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Timeline View */}
            {filteredLogs.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/30 rounded-3xl border border-slate-700/50">
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <i className="fa-solid fa-fingerprint text-3xl text-slate-600"></i>
                    </div>
                    <p className="text-slate-500 font-bold">Nenhum registro de atividade encontrado.</p>
                </div>
            ) : (
                <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700">
                    <div className="relative border-l-2 border-slate-700 ml-3 md:ml-6 space-y-8">
                        {filteredLogs.map((log, index) => (
                            <div key={log.id || index} className="relative pl-6 md:pl-8 group">
                                {/* Timestamp Dot */}
                                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 group-hover:scale-125 transition-transform flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                                </div>

                                {/* Content Card */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-blue-500/30 transition-all">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-1 rounded text-[10px] uppercase font-black tracking-widest ${log.action === 'Criação' ? 'bg-green-500/20 text-green-400' :
                                                    log.action === 'Inclusão' ? 'bg-green-500/20 text-green-400' :
                                                        log.action === 'Exclusão' ? 'bg-red-500/20 text-red-400' :
                                                            'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {log.action}
                                            </span>

                                            {/* Project Badge */}
                                            <span className="px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-700 text-slate-300 border border-slate-600">
                                                <i className="fa-solid fa-building mr-1"></i>
                                                {log.projectName}
                                            </span>

                                            <span className="text-xs font-bold text-slate-400">
                                                {new Date(log.timestamp).toLocaleString('pt-BR')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-400">
                                                {(log.userName && log.userName[0]) ? log.userName[0].toUpperCase() : '-'}
                                            </div>
                                            <span className="text-xs text-slate-500 font-bold">{log.userName}</span>
                                        </div>
                                    </div>

                                    <div className="text-sm font-bold text-white mb-2">
                                        {log.field === '-' ? (
                                            <span>Realizou uma ação de <span className="text-blue-400">{log.action}</span></span>
                                        ) : (
                                            <span>Alterou <span className="text-blue-400">{log.field}</span></span>
                                        )}
                                    </div>

                                    {log.oldValue !== '-' && log.newValue !== '-' && (
                                        <div className="flex items-center gap-3 text-xs bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">De:</div>
                                                <div className="text-red-400 font-mono truncate" title={log.oldValue}>{log.oldValue}</div>
                                            </div>
                                            <i className="fa-solid fa-arrow-right text-slate-600"></i>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Para:</div>
                                                <div className="text-green-400 font-mono truncate" title={log.newValue}>{log.newValue}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditPage;
