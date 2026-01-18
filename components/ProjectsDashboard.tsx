
import React, { useState } from 'react';
import { Project, ProgressStage, STAGE_NAMES } from '../types';

interface ProjectsDashboardProps {
  projects: Project[];
  onSelect: (id: string) => void;
  onAdd: (project: any) => void;
  isAdmin: boolean;
}

const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({ projects, onSelect, onAdd, isAdmin }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    unitCount: 0,
    totalArea: 0,
    expectedTotalCost: 0,
    expectedTotalSales: 0,
    progress: ProgressStage.PLANNING
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
    setShowAddModal(false);
    setFormData({
      name: '',
      unitCount: 0,
      totalArea: 0,
      expectedTotalCost: 0,
      expectedTotalSales: 0,
      progress: ProgressStage.PLANNING
    });
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-100 font-bold"
          >
            <i className="fa-solid fa-plus mr-2"></i> Nova Obra
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center text-slate-400">
          <i className="fa-solid fa-helmet-safety text-5xl mb-4 text-slate-200"></i>
          <p className="font-medium">Nenhuma obra encontrada. Vamos construir?</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <i className="fa-solid fa-building text-xl"></i>
                </div>
                <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-600">
                  {p.progress}%
                </span>
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-2">{p.name}</h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">{STAGE_NAMES[p.progress]}</p>

              <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${p.progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Início</span>
                <span>Entrega</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-800">Nova Obra</h2>
              <button onClick={() => setShowAddModal(false)} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Nome do Empreendimento</label>
                <input
                  required
                  type="text"
                  className="w-full p-4 bg-white border-2 border-slate-200 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-slate-800"
                  placeholder="Ex: Residencial Aurora"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-100 font-black"
                >
                  Criar Projeto
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
