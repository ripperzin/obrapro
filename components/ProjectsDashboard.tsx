import React, { useState } from 'react';
import { Project, ProgressStage, STAGE_NAMES } from '../types';
import StageThumbnail from './StageThumbnail';
import DateInput from './DateInput';

interface ProjectsDashboardProps {
  projects: Project[];
  onSelect: (id: string) => void;
  onAdd: (project: any) => void;
  onUpdate?: (id: string, updates: Partial<Project>, logMsg?: string) => void;
  onDelete?: (id: string) => void;
  isAdmin: boolean;
}

import ConfirmModal from './ConfirmModal';

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

  // State for delete confirmation
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    deliveryDate: '',
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
      startDate: '',
      deliveryDate: '',
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
      startDate: project.startDate || '',
      deliveryDate: project.deliveryDate || '',
      unitCount: 0,
      totalArea: 0,
      expectedTotalCost: 0,
      expectedTotalSales: 0,
      progress: project.progress
    });
    setShowModal(true);
  };

  const requestDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setProjectToDelete(projectId);
  };

  const handleConfirmDelete = () => {
    if (projectToDelete && onDelete) {
      onDelete(projectToDelete);
      setProjectToDelete(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProject && onUpdate) {
      onUpdate(editingProject.id, {
        name: formData.name,
        startDate: formData.startDate || undefined,
        deliveryDate: formData.deliveryDate || undefined
      }, `Projeto atualizado: ${formData.name}`);
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
                {/* Stage photo or icon - show the most recent stage photo */}
                {(() => {
                  // Get the most recent evidence (highest stage number that has photos)
                  const evidencesWithPhotos = (p.stageEvidence || [])
                    .filter(e => e.photos && e.photos.length > 0)
                    .sort((a, b) => b.stage - a.stage);

                  const latestEvidence = evidencesWithPhotos[0];
                  const photo = latestEvidence?.photos?.[0];

                  // Debug log
                  console.log(`Project ${p.name}: stageEvidence=`, p.stageEvidence, 'photo=', photo);

                  if (photo) {
                    return (
                      <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border-2 border-blue-500/30 group-hover:border-blue-500 transition-colors">
                        <StageThumbnail photoPath={photo} className="w-full h-full" />
                      </div>
                    );
                  }

                  return (
                    <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
                      <i className="fa-solid fa-building text-2xl"></i>
                    </div>
                  );
                })()}
                <div className="flex gap-2">
                  <span className="px-4 py-2 bg-slate-50 rounded-full text-xs font-black text-slate-600 border border-slate-100">
                    {p.progress}%
                  </span>
                  {/* Buttons always visible for now based on user request, or kept under isAdmin if strict. 
                      User asked to "place edit and delete for each work", suggesting they might not be seeing them.
                      I'll assume they are admin, but just in case, I'll keep the isAdmin check if that's the intended logic,
                      BUT if the user is having trouble finding them, maybe I should make them more prominent or remove the check?
                      The codebase seems to rely on isAdmin for these privileges. I will keep isAdmin but ensure the buttons are distinct.
                   */}
                  {isAdmin && (
                    <>
                      <button
                        onClick={(e) => openEditModal(e, p)}
                        className="w-8 h-8 flex items-center justify-center bg-blue-50 border border-blue-200 text-blue-600 rounded-full hover:bg-blue-100 transition"
                        title="Editar Obra"
                      >
                        <i className="fa-solid fa-pen text-xs"></i>
                      </button>
                      <button
                        onClick={(e) => requestDelete(e, p.id)}
                        className="w-8 h-8 flex items-center justify-center bg-red-50 border border-red-200 text-red-600 rounded-full hover:bg-red-100 transition"
                        title="Excluir Obra"
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
              <div className="flex justify-between text-xs font-bold text-slate-500 px-1">
                <span className="flex flex-col items-start">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400">Início</span>
                  <span className="text-slate-600">{p.startDate ? new Date(p.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400">Entrega</span>
                  <span className="text-slate-600">{p.deliveryDate ? new Date(p.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                </span>
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
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1">Início</label>
                  <DateInput
                    value={formData.startDate}
                    onChange={(val) => setFormData({ ...formData, startDate: val })}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-slate-800 shadow-sm text-sm text-center"
                    placeholder="DD/MM/AAAA"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1">Entrega</label>
                  <DateInput
                    value={formData.deliveryDate}
                    onChange={(val) => setFormData({ ...formData, deliveryDate: val })}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-slate-800 shadow-sm text-sm text-center"
                    placeholder="DD/MM/AAAA"
                  />
                </div>
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

      <ConfirmModal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Excluir Obra?"
        message="Tem certeza que deseja excluir esta obra? Todas as unidades, despesas e históricos associados serão perdidos permanentemente."
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
};

export default ProjectsDashboard;

