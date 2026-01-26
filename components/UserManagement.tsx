import React, { useState, useEffect } from 'react';
import { User, UserRole, Project } from '../types';
import { supabase } from '../supabaseClient';
import { generateId } from '../utils';

interface UserManagementProps {
  // Props simplificadas, o componente agora busca seus dados
  projects: Project[];
  currentUser: User;
}

// Tipo estendido para incluir dados do banco
interface UserProfile extends User {
  email: string;
}

const UserManagement: React.FC<UserManagementProps> = ({ projects, currentUser }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar perfis e permissões reais
  const fetchUsersData = async () => {
    try {
      setLoading(true);

      // 1. Buscar Perfis
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // 2. Buscar Membros de Projetos
      const { data: membersData, error: membersError } = await supabase
        .from('project_members')
        .select('*');

      if (membersError) throw membersError;

      // 3. Montar objeto unificado
      const fullProfiles: UserProfile[] = profilesData.map(p => {
        // Encontrar projetos onde este usuário é membro
        const userProjects = membersData
          .filter(m => m.user_id === p.id)
          .map(m => m.project_id);

        return {
          id: p.id,
          login: p.email.split('@')[0], // Fallback visual
          email: p.email,
          role: (p.role || 'standard').toUpperCase() as UserRole,
          allowedProjectIds: userProjects,
          canSeeUnits: true // Por enquanto hardcoded ou criar coluna futura
        };
      });

      setProfiles(fullProfiles);
    } catch (err: any) {
      console.error('Erro ao buscar usuários:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersData();
  }, [projects]); // Recarrega se projetos mudarem

  const toggleProjectAccess = async (userId: string, projectId: string, hasAccess: boolean) => {
    try {
      if (hasAccess) {
        // REMOVER ACESSO
        const { error } = await supabase
          .from('project_members')
          .delete()
          .match({ project_id: projectId, user_id: userId });

        if (error) throw error;
      } else {
        // ADICIONAR ACESSO
        const { error } = await supabase
          .from('project_members')
          .insert({
            project_id: projectId,
            user_id: userId,
            role: 'editor' // Default role
          });

        if (error) throw error;
      }

      // Atualizar UI localmente para ser rápido
      setProfiles(prev => prev.map(u => {
        if (u.id === userId) {
          const newAllowed = hasAccess
            ? u.allowedProjectIds.filter(id => id !== projectId)
            : [...u.allowedProjectIds, projectId];
          return { ...u, allowedProjectIds: newAllowed };
        }
        return u;
      }));

    } catch (err: any) {
      alert('Erro ao alterar permissão: ' + err.message);
    }
  };

  const handleCopyInviteLink = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    alert('Link copiado! Envie para sua equipe se cadastrar.');
  };

  if (loading) return <div className="p-8 text-white">Carregando usuários...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-200">Gestão de Equipe (Real) 👥</h3>
        <button
          onClick={handleCopyInviteLink}
          className="px-6 py-2 bg-slate-800 border border-slate-700 text-blue-400 rounded-xl hover:bg-slate-700 transition font-bold text-sm flex items-center gap-2"
        >
          <i className="fa-solid fa-link"></i>
          Copiar Link de Convite
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-200 text-sm">
          Erro: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {profiles.map(u => (
          <div key={u.id} className="bg-slate-800/40 backdrop-blur-sm p-6 rounded-3xl border border-slate-700/50 flex flex-col md:flex-row gap-6 md:items-center shadow-lg">
            <div className="w-64">
              <div className="flex items-center space-x-3 mb-1">
                <div className={`w-3 h-3 rounded-full ${u.role === UserRole.ADMIN ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-blue-500'}`}></div>
                <div>
                  <span className="font-bold text-white block">{u.email}</span>
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{u.role === UserRole.ADMIN ? 'Administrador' : 'Membro da Equipe'}</span>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Obras Liberadas</p>
              <div className="flex flex-wrap gap-2">
                {u.role === UserRole.ADMIN ? (
                  <span className="text-xs text-purple-300 font-bold bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <i className="fa-solid fa-crown text-[10px]"></i> Acesso Total (Admin)
                  </span>
                ) : (
                  projects.map(p => {
                    const hasAccess = u.allowedProjectIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleProjectAccess(u.id, p.id, hasAccess)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition border flex items-center gap-2 ${hasAccess
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20'
                          : 'bg-slate-900/50 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                          }`}
                      >
                        <i className={`fa-solid ${hasAccess ? 'fa-check' : 'fa-lock'} text-[9px]`}></i>
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Removido controle de "Ver Unidades" pois agora é tudo via Project Members */}
          </div>
        ))}
      </div>

      <div className="bg-blue-900/20 border border-blue-500/30 p-6 rounded-2xl flex gap-4 items-start">
        <i className="fa-solid fa-info-circle text-blue-400 text-xl mt-1"></i>
        <div>
          <h4 className="text-blue-200 font-bold mb-1">Como adicionar pessoas?</h4>
          <p className="text-slate-400 text-sm leading-relaxed">
            Por segurança, novos usuários devem criar suas próprias contas.
            Envie o link do site para sua equipe. Assim que eles se cadastrarem,
            aparecerão nesta lista automaticamente para você liberar as obras.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
