
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, UserRole, Project, ProgressStage, LogEntry, Unit, Expense } from './types';
import { INITIAL_ADMIN } from './constants';
import { generateId } from './utils';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

// Pages
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import ProjectsDashboard from './components/ProjectsDashboard';
import ProjectDetail from './components/ProjectDetail';
import GeneralDashboard from './components/GeneralDashboard';
import UserManagement from './components/UserManagement';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'projects' | 'general' | 'users'>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([INITIAL_ADMIN]);
  const [projects, setProjects] = useState<Project[]>([]);
  const isLoaded = useRef(false); // Flag de blindagem

  // 1. Monitoramento de Sessão (Supabase Auth)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Mapeamento de Usuário baseado na Sessão
  useEffect(() => {
    if (session?.user) {
      const userEmail = session.user.email || '';
      const isAdmin = userEmail.startsWith('victoravila') || userEmail === 'admin@obrapro.com';

      setCurrentUser({
        id: session.user.id,
        login: userEmail.split('@')[0],
        password: '',
        role: isAdmin ? UserRole.ADMIN : UserRole.STANDARD,
        allowedProjectIds: [], // Pode ser populado por uma tabela de permissões no futuro
        canSeeUnits: true
      });
    } else {
      setCurrentUser(null);
    }
  }, [session]);

  // 3. Busca de Dados do Banco (Supabase)
  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user) return;

      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          units (*),
          expenses (*),
          logs (*)
        `);

      if (projectsError) {
        console.error('Erro ao buscar projetos:', projectsError);
      } else if (projectsData) {
        const mappedProjects = projectsData.map((p: any) => ({
          ...p,
          id: p.id,
          unitCount: p.unit_count || 0,
          totalArea: p.total_area || 0,
          expectedTotalCost: p.expected_total_cost || 0,
          expectedTotalSales: p.expected_total_sales || 0,
          progress: p.progress || 0,
          units: (p.units || []).map((u: any) => ({
            ...u,
            valorEstimadoVenda: u.valor_estimado_venda || 0,
            saleValue: u.sale_value,
            saleDate: u.sale_date
          })),
          expenses: p.expenses || [],
          logs: (p.logs || []).map((l: any) => ({
            ...l,
            timestamp: l.timestamp,
            userId: l.user_id,
            userName: l.user_name,
            oldValue: l.old_value,
            newValue: l.new_value
          }))
        }));
        setProjects(mappedProjects);
      }
      isLoaded.current = true;
    };

    fetchData();
  }, [session]);

  // Salvamento condicional apenas para usuários locais (opcional/legado)
  useEffect(() => {
    if (isLoaded.current) {
      localStorage.setItem('obras_users', JSON.stringify(users));
    }
  }, [users]);

  const handleLoginSuccess = (session: Session) => {
    setSession(session);
    // User is handled by onAuthStateChange
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setSession(null);
    setSelectedProjectId(null);
  };

  const addProject = async (project: Omit<Project, 'id' | 'units' | 'expenses' | 'logs'>) => {
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        name: project.name,
        unit_count: project.unitCount,
        total_area: project.totalArea,
        expected_total_cost: project.expectedTotalCost,
        expected_total_sales: project.expectedTotalSales,
        progress: project.progress
      }])
      .select()
      .single();

    if (error) {
      alert('Erro ao adicionar projeto: ' + error.message);
      return;
    }

    if (data) {
      const newProject: Project = { ...data, units: [], expenses: [], logs: [] };
      setProjects([...projects, newProject]);

      // Log no Supabase
      await supabase.from('logs').insert([{
        project_id: data.id,
        user_id: currentUser?.id,
        user_name: currentUser?.login,
        action: 'Criação',
        field: 'Projeto',
        old_value: '-',
        new_value: project.name
      }]);
    }
  };

  const updateProject = async (projectId: string, updates: Partial<Project>, logMsg?: string) => {
    // 1. Mapear campos básicos de camelCase para snake_case para o banco
    const supabaseUpdates: any = {};
    if (updates.name !== undefined) supabaseUpdates.name = updates.name;
    if (updates.progress !== undefined) supabaseUpdates.progress = updates.progress;
    if (updates.unitCount !== undefined) supabaseUpdates.unit_count = updates.unitCount;
    if (updates.totalArea !== undefined) supabaseUpdates.total_area = updates.totalArea;
    if (updates.expectedTotalCost !== undefined) supabaseUpdates.expected_total_cost = updates.expectedTotalCost;
    if (updates.expectedTotalSales !== undefined) supabaseUpdates.expected_total_sales = updates.expectedTotalSales;

    // 2. Atualizar tabela de projetos (campos básicos)
    if (Object.keys(supabaseUpdates).length > 0) {
      const { error } = await supabase
        .from('projects')
        .update(supabaseUpdates)
        .eq('id', projectId);

      if (error) {
        alert('Erro ao atualizar projeto: ' + error.message);
        return;
      }
    }

    // 3. Persistência de Unidades (se houver atualização)
    if (updates.units) {
      const unitsToUpsert = updates.units.map(u => ({
        id: u.id,
        project_id: projectId,
        identifier: u.identifier,
        area: u.area,
        cost: u.cost,
        status: u.status,
        valor_estimado_venda: u.valorEstimadoVenda,
        sale_value: u.saleValue,
        sale_date: u.saleDate
      }));

      const { error: unitsError } = await supabase
        .from('units')
        .upsert(unitsToUpsert, { onConflict: 'id' });

      if (unitsError) {
        alert('Erro ao salvar unidades: ' + unitsError.message);
        console.error('Erro ao salvar unidades:', unitsError);
        return; // Interrompe para não atualizar o estado local com dados não salvos
      }
    }

    // 4. Persistência de Despesas (se houver atualização)
    if (updates.expenses) {
      const expensesToUpsert = updates.expenses.map(e => ({
        id: e.id,
        project_id: projectId,
        description: e.description,
        value: e.value,
        date: e.date,
        user_id: e.userId,
        user_name: e.userName
      }));

      const { error: expError } = await supabase
        .from('expenses')
        .upsert(expensesToUpsert, { onConflict: 'id' });

      if (expError) {
        alert('Erro ao salvar despesas: ' + expError.message);
        console.error('Erro ao salvar despesas:', expError);
        return;
      }
    }

    // 5. Persistência de Logs
    if (updates.logs) {
      const projectLogs = projects.find(p => p.id === projectId)?.logs || [];
      const logsToInsert = updates.logs
        .filter(l => !projectLogs.find(existing => existing.id === l.id))
        .map(l => ({
          id: l.id,
          project_id: projectId,
          user_id: l.userId,
          user_name: l.userName,
          action: l.action,
          field: l.field,
          old_value: l.oldValue,
          new_value: l.newValue,
          timestamp: l.timestamp
        }));

      if (logsToInsert.length > 0) {
        const { error: logsError } = await supabase.from('logs').insert(logsToInsert);
        if (logsError) console.error('Erro ao salvar logs:', logsError.message);
      }
    }

    // 6. Atualização do estado local
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));

    // 7. Log adicional opcional
    if (logMsg) {
      await supabase.from('logs').insert([{
        id: generateId(),
        project_id: projectId,
        user_id: currentUser?.id,
        user_name: currentUser?.login,
        action: 'Alteração',
        field: 'Geral',
        old_value: 'vários',
        new_value: logMsg
      }]);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === UserRole.ADMIN) return projects;
    return projects.filter(p => currentUser.allowedProjectIds.includes(p.id));
  }, [projects, currentUser]);

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar
        role={currentUser.role}
        activeTab={activeTab}
        setActiveTab={(tab) => { setActiveTab(tab); setSelectedProjectId(null); }}
        onLogout={logout}
      />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {activeTab === 'projects' && (selectedProjectId ? 'Detalhes da Obra' : 'Obras')}
              {activeTab === 'general' && 'Visão Geral Financeira'}
              {activeTab === 'users' && 'Gestão de Usuários'}
            </h1>
            <p className="text-slate-500">Bem-vindo, {currentUser.login}</p>
          </div>
          {selectedProjectId && (
            <button
              onClick={() => setSelectedProjectId(null)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-sm"
            >
              <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
            </button>
          )}
        </header>

        {activeTab === 'projects' && (
          selectedProjectId ? (
            <ProjectDetail
              project={selectedProject!}
              user={currentUser}
              onUpdate={updateProject}
            />
          ) : (
            <ProjectsDashboard
              projects={filteredProjects}
              onSelect={setSelectedProjectId}
              onAdd={addProject}
              isAdmin={currentUser.role === UserRole.ADMIN}
            />
          )
        )}

        {activeTab === 'general' && (
          <GeneralDashboard projects={filteredProjects} />
        )}

        {activeTab === 'users' && currentUser.role === UserRole.ADMIN && (
          <UserManagement
            users={users}
            setUsers={setUsers}
            projects={projects}
            currentUser={currentUser}
          />
        )}
      </main>
    </div>
  );
};

export default App;
