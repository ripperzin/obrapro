
import React, { useState } from 'react';
import { User, UserRole, Project } from '../types';
import { generateId } from '../utils';

interface UserManagementProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  projects: Project[];
  currentUser: User;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, setUsers, projects, currentUser }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState<Omit<User, 'id'>>({
    login: '',
    password: '',
    role: UserRole.STANDARD,
    allowedProjectIds: [],
    canSeeUnits: true
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: User = { ...formData, id: generateId() };
    setUsers([...users, newUser]);
    setShowAdd(false);
    setFormData({ login: '', password: '', role: UserRole.STANDARD, allowedProjectIds: [], canSeeUnits: true });
  };

  const toggleProjectAccess = (userId: string, projectId: string) => {
    setUsers(users.map(u => {
      if (u.id === userId) {
        const allowed = u.allowedProjectIds.includes(projectId)
          ? u.allowedProjectIds.filter(id => id !== projectId)
          : [...u.allowedProjectIds, projectId];
        return { ...u, allowedProjectIds: allowed };
      }
      return u;
    }));
  };

  const toggleUnitsAccess = (userId: string) => {
    setUsers(users.map(u => u.id === userId ? { ...u, canSeeUnits: !u.canSeeUnits } : u));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">Equipe e Permissões</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-bold text-sm"
        >
          Criar Novo Usuário
        </button>
      </div>

      {showAdd && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Login</label>
              <input required className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500" value={formData.login} onChange={e => setFormData({ ...formData, login: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Senha</label>
              <input required type="password" className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Perfil</label>
              <select className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}>
                <option value={UserRole.STANDARD}>Usuário Padrão</option>
                <option value={UserRole.ADMIN}>Administrador</option>
              </select>
            </div>
            <div className="md:col-span-3 flex gap-4 pt-2">
              <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold">Salvar Usuário</button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {users.map(u => (
          <div key={u.id} className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-6 md:items-center">
            <div className="w-48">
              <div className="flex items-center space-x-3 mb-1">
                <div className={`w-3 h-3 rounded-full ${u.role === UserRole.ADMIN ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                <span className="font-bold text-slate-800">{u.login}</span>
              </div>
              <p className="text-xs text-slate-400 uppercase font-bold tracking-tighter">{u.role === UserRole.ADMIN ? 'Administrador' : 'Usuário Padrão'}</p>
            </div>

            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Obras Liberadas</p>
              <div className="flex flex-wrap gap-2">
                {u.role === UserRole.ADMIN ? (
                  <span className="text-xs text-purple-600 font-bold bg-purple-50 px-2 py-1 rounded">Acesso Total</span>
                ) : (
                  projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleProjectAccess(u.id, p.id)}
                      className={`text-[10px] font-bold px-2 py-1 rounded transition ${u.allowedProjectIds.includes(p.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="w-40 flex flex-col items-end">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Visão Unidades</p>
              <button
                disabled={u.role === UserRole.ADMIN}
                onClick={() => toggleUnitsAccess(u.id)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold ${u.canSeeUnits ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
              >
                <i className={`fa-solid ${u.canSeeUnits ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                <span>{u.canSeeUnits ? 'Ativo' : 'Bloqueado'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserManagement;
