
import React, { useState } from 'react';
import { Project, ProgressStage, STAGE_NAMES } from '../types';

interface ProjectsDashboardProps {
  projects: Project[];
  onSelect: (id: string) => void;
  onAdd: (project: any) => void;
  onUpdate?: (id: string, updates: Partial<Project>, logMsg?: string) => void;
  onDelete?: (id: string) => void;
  isAdmin: boolean;
}

const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({ projects, onSelect, onAdd, onUpdate, onDelete, isAdmin }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    unitCount: 0,
    totalArea: 0,
    expectedTotalCost: 0,
    expectedTotalSales: 0,
    progress: ProgressStage.PLANNING
  });

  const openAddModal = () => {
    setEditingProject(null);
    setFormData({
      name: '',
      unitCount: 0,
      totalArea: 0,
      expectedTotalCost: 0,
      expectedTotalSales: 0,
      progress: ProgressStage.PLANNING
    });
    setShowModal(true);
  };

  const openEditModal = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingProject(project);
    setFormData({
      name: project.name,
      unitCount: 0, // Campos de info apenas, idealmente não ditariam lógica se forem calculados
      totalArea: 0,
      expectedTotalCost: 0,
      expectedTotalSales: 0,
      progress: project.progress
    });
    setShowModal(true);
  };

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (onDelete) onDelete(projectId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProject && onUpdate) {
      onUpdate(editingProject.id, { name: formData.name }, `Nome da obra alterado para ${formData.name}`);
    } else {
      onAdd(formData);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-8">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={openAddModal}
            className="px-8 py-4 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-xl shadow-blue-100 font-black flex items-center gap-2"
          >
            <i className="fa-solid fa-plus"></i> Nova Obra
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white border-4 border-dashed border-slate-200 rounded-[3rem] p-16 text-center text-slate-400">
          <i className="fa-solid fa-helmet-safety text-6xl mb-6 text-slate-200"></i>
          <p className="font-bold text-lg">Nenhuma obra encontrada. Vamos construir?</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="bg-white rounded-[2.5rem] p-8 shadow-sm border-4 border-blue-600 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
                  <i className="fa-solid fa-building text-2xl"></i>
                </div>
                <div className="flex gap-2">
                  <span className="px-4 py-2 bg-slate-50 rounded-full text-xs font-black text-slate-600 border border-slate-100">
                    {p.progress}%
                  </span>
                  {isAdmin && (
                    <>
                      <button
                        onClick={(e) => openEditModal(e, p)}
                        className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
                      >
                        <i className="fa-solid fa-pen text-xs"></i>
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, p.id)}
                        className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                      >
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h3 className="text-2xl font-black text-slate-800 mb-2 leading-tight group-hover:text-blue-700 transition-colors">{p.name}</h3>
              <p className="text-sm text-slate-400 mb-8 font-bold uppercase tracking-widest">{STAGE_NAMES[p.progress]}</p>

              <div className="w-full bg-slate-100 rounded-full h-4 mb-3 overflow-hidden border border-slate-200">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                  style={{ width: `${p.progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">
                <span>Início</span>
                <span>Entrega</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300 border-4 border-blue-600">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {editingProject ? 'Editar Obra' : 'Nova Obra'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-full text-slate-400 hover:text-red-500 hover:border-red-200 transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-4">Nome do Empreendimento</label>
                <input
                  required
                  type="text"
                  className="w-full px-6 py-4 bg-white border-2 border-slate-200 focus:border-blue-500 rounded-[1.5rem] outline-none transition-all font-bold text-slate-800 shadow-sm text-sm"
                  placeholder="Ex: Residencial Aurora"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="pt-2 flex gap-4">
                <button
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-lg shadow-blue-200 font-black uppercase text-xs tracking-widest"
                >
                  {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsDashboard;
