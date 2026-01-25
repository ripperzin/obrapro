
import React from 'react';
import { Project } from '../types';
import StageThumbnail from './StageThumbnail';

interface ProjectsDashboardProps {
  projects: Project[];
  onSelect: (id: string) => void;
  onAdd?: (project: any) => void;
  onUpdate?: (id: string, updates: Partial<Project>) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
}

const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({ projects, onSelect, onAdd, isAdmin }) => {
  return (
    <div className="animate-fade-in pb-20 md:pb-0">
      {/* Header Mobile Omitted (Already covered in App.tsx) */}

      {/* Botão Adicionar (Mobile e Desktop) */}
      {isAdmin && onAdd && (
        <div className="mb-6 flex justify-end md:justify-start">
          <button
            onClick={() => onAdd({})}
            className="w-full md:w-auto px-8 py-4 bg-emerald-600 text-white rounded-2xl md:rounded-full hover:bg-emerald-700 transition shadow-lg md:shadow-xl shadow-emerald-900/20 font-black flex items-center justify-center gap-2 border border-emerald-500/50"
          >
            <i className="fa-solid fa-plus"></i>
            ADICIONAR EMPREENDIMENTO
          </button>
        </div>
      )}

      {/* Grid de Projetos */}
      {projects.length === 0 ? (
        <div className="bg-slate-800/50 border-4 border-dashed border-slate-700 rounded-[3rem] p-16 text-center text-slate-400">
          <i className="fa-solid fa-helmet-safety text-6xl mb-6 text-slate-600"></i>
          <p className="font-bold text-lg">Nenhuma obra encontrada. Vamos construir?</p>
        </div>
      ) : (
        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-0 md:gap-8">
          {projects.map(project => {
            // Lógica de Evidências (para thumbnail)
            const evidencesWithPhotos = (project.stageEvidence || [])
              .filter(e => e.photos && e.photos.length > 0)
              .sort((a, b) => b.stage - a.stage);

            const latestEvidence = evidencesWithPhotos[0];
            const photo = latestEvidence?.photos?.[0];

            return (
              <div
                key={project.id}
                onClick={() => onSelect(project.id)}
                className="w-full bg-transparent md:glass border-b border-slate-800 md:border md:border-transparent md:rounded-3xl p-4 md:p-6 cursor-pointer group hover:bg-slate-800/50 transition-all active:scale-[0.98] md:hover:transform md:hover:-translate-y-2 md:hover:shadow-2xl"
              >
                <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-6">
                  {/* Thumbnail / Icone */}
                  <div className="shrink-0">
                    {photo ? (
                      <div className="w-16 h-16 md:w-full md:h-48 rounded-xl md:rounded-2xl overflow-hidden shadow-sm border border-slate-700/50">
                        <StageThumbnail photoPath={photo} className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-110" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 md:w-full md:h-48 bg-slate-800 rounded-xl md:rounded-2xl flex items-center justify-center border border-slate-700/50">
                        <i className="fa-solid fa-building text-2xl md:text-5xl text-slate-600 group-hover:text-blue-500 transition-colors"></i>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 w-full">
                    {/* Header (Nome e Status) */}
                    <div className="flex justify-between items-start mb-1 md:mb-4">
                      <h3 className="font-bold text-lg md:text-xl text-white truncate pr-2 group-hover:text-blue-400 transition-colors">
                        {project.name}
                      </h3>
                      <span className="bg-blue-500/10 text-blue-400 text-[10px] md:text-xs font-black px-2 py-1 rounded-full uppercase tracking-wider border border-blue-500/20">
                        {project.progress}%
                      </span>
                    </div>

                    {/* Stats Compacto (Mobile) / Detalhado (Desktop) */}
                    <div className="flex flex-col gap-1 md:gap-3">
                      <div className="flex items-center gap-2 text-slate-400 text-xs md:text-sm">
                        <i className="fa-solid fa-tag w-4 text-center"></i>
                        <span>{project.units.filter(u => u.status === 'Available').length} disponíveis</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 text-xs md:text-sm">
                        <i className="fa-solid fa-check-circle w-4 text-center"></i>
                        <span>{project.units.filter(u => u.status === 'Sold').length} vendidas</span>
                      </div>
                    </div>

                    {/* Progress Bar (Desktop Only for cleanliness on mobile) */}
                    <div className="hidden md:block mt-6 w-full bg-slate-700/50 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-1000 ease-out"
                        style={{ width: `${project.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Seta (Mobile Only) */}
                  <div className="block md:hidden text-slate-600">
                    <i className="fa-solid fa-chevron-right"></i>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectsDashboard;
