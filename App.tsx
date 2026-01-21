
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
import MobileNav from './components/MobileNav';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'projects' | 'general' | 'users'>('general');
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
          logs (*),
          documents (*)
        `);

      if (projectsError) {
        console.error('Erro ao buscar projetos:', projectsError);
      } else if (projectsData) {
        // Buscar Diário separadamente para evitar erro de agregação do PostgREST
        const projectIds = projectsData.map((p: any) => p.id);
        let diaryMap: Record<string, any[]> = {};
        let evidenceMap: Record<string, any[]> = {};

        if (projectIds.length > 0) {
          // Buscar Diário
          const { data: diaryData, error: diaryError } = await supabase
            .from('diary_entries')
            .select('*')
            .in('project_id', projectIds);

          if (diaryError) console.error('Erro ao buscar diário:', diaryError);

          if (diaryData) {
            diaryData.forEach((d: any) => {
              if (!diaryMap[d.project_id]) diaryMap[d.project_id] = [];
              diaryMap[d.project_id].push(d);
            });
          }

          // Buscar Evidências
          const { data: evidenceData, error: evidenceError } = await supabase
            .from('stage_evidences')
            .select('*')
            .in('project_id', projectIds);

          if (evidenceError) console.error('Erro ao buscar evidências:', evidenceError);

          if (evidenceData) {
            evidenceData.forEach((e: any) => {
              if (!evidenceMap[e.project_id]) evidenceMap[e.project_id] = [];
              evidenceMap[e.project_id].push(e);
            });
          }
        }

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
          expenses: (p.expenses || []).map((e: any) => ({
            ...e,
            attachmentUrl: e.attachment_url
          })),
          logs: (p.logs || []).map((l: any) => ({
            ...l,
            timestamp: l.timestamp,
            userId: l.user_id,
            userName: l.user_name,
            oldValue: l.old_value,
            newValue: l.new_value
          })),
          documents: (p.documents || []).map((d: any) => ({
            id: d.id,
            title: d.title,
            category: d.category,
            url: d.url,
            createdAt: d.created_at
          })),
          diary: (diaryMap[p.id] || []).map((d: any) => ({
            id: d.id,
            date: d.date,
            content: d.content,
            photos: d.photos || [],
            author: d.author,
            createdAt: d.created_at
          })),
          stageEvidence: (evidenceMap && evidenceMap[p.id] || []).map((e: any) => ({
            stage: e.stage,
            photos: e.photos || [],
            date: e.date,
            notes: e.notes,
            user: e.user_name
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
      const newProject: Project = { ...data, units: [], expenses: [], logs: [], documents: [], diary: [] };
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
      console.log('=== DEBUG: Salvando unidades ===');
      console.log('Project ID:', projectId);
      console.log('Units to save:', updates.units);

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

      console.log('Units formatted for Supabase:', unitsToUpsert);

      const { data: upsertData, error: unitsError } = await supabase
        .from('units')
        .upsert(unitsToUpsert, { onConflict: 'id' })
        .select();

      console.log('Supabase upsert result - data:', upsertData);
      console.log('Supabase upsert result - error:', unitsError);

      if (unitsError) {
        alert('Erro ao salvar unidades: ' + unitsError.message);
        console.error('Erro ao salvar unidades:', unitsError);
        return;
      }
    }

    // 4. Persistência de Despesas (se houver atualização)
    if (updates.expenses !== undefined) {
      // Buscar despesas atuais do projeto para comparar
      const currentProject = projects.find(p => p.id === projectId);
      const currentExpenseIds = currentProject?.expenses.map(e => e.id) || [];
      const newExpenseIds = updates.expenses.map(e => e.id);

      // Identificar despesas que foram removidas
      const deletedExpenseIds = currentExpenseIds.filter(id => !newExpenseIds.includes(id));

      // Deletar despesas removidas
      if (deletedExpenseIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('expenses')
          .delete()
          .in('id', deletedExpenseIds);

        if (deleteError) {
          alert('Erro ao excluir despesas: ' + deleteError.message);
          console.error('Erro ao excluir despesas:', deleteError);
          return;
        }
      }

      // Upsert das despesas restantes
      if (updates.expenses.length > 0) {
        const expensesToUpsert = updates.expenses.map(e => ({
          id: e.id,
          project_id: projectId,
          description: e.description,
          value: e.value,
          date: e.date,
          user_id: e.userId,
          user_name: e.userName,
          attachment_url: e.attachmentUrl
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

    // 6. Persistência de Documentos
    if (updates.documents !== undefined) {
      const currentProject = projects.find(p => p.id === projectId);
      const currentDocIds = currentProject?.documents.map(d => d.id) || [];
      const newDocIds = updates.documents.map(d => d.id);

      const deletedDocIds = currentDocIds.filter(id => !newDocIds.includes(id));

      if (deletedDocIds.length > 0) {
        await supabase.from('documents').delete().in('id', deletedDocIds);
      }

      if (updates.documents.length > 0) {
        const docsToUpsert = updates.documents.map(d => ({
          id: d.id,
          project_id: projectId,
          title: d.title,
          category: d.category,
          url: d.url,
          created_at: d.createdAt
        }));

        const { error: docError } = await supabase
          .from('documents')
          .upsert(docsToUpsert, { onConflict: 'id' });

        if (docError) {
          alert('Erro ao salvar documentos: ' + docError.message);
          console.error('Erro ao salvar documentos:', docError);
        }
      }
    }

    // 7. Persistência de Diário
    if (updates.diary !== undefined) {
      const currentProject = projects.find(p => p.id === projectId);
      const currentEntryIds = currentProject?.diary.map(d => d.id) || [];
      const newEntryIds = updates.diary.map(d => d.id);

      const deletedEntryIds = currentEntryIds.filter(id => !newEntryIds.includes(id));

      if (deletedEntryIds.length > 0) {
        await supabase.from('diary_entries').delete().in('id', deletedEntryIds);
      }

      if (updates.diary.length > 0) {
        const entriesToUpsert = updates.diary.map(d => ({
          id: d.id,
          project_id: projectId,
          date: d.date,
          content: d.content,
          photos: d.photos,
          author: d.author,
          created_at: d.createdAt,
          user_id: currentUser?.id
        }));

        const { error: diaryError } = await supabase
          .from('diary_entries')
          .upsert(entriesToUpsert, { onConflict: 'id' });

        if (diaryError) {
          console.error('Erro ao salvar diário:', diaryError);
        }
      }
    }

    // 8. Persistência de Evidências de Etapas
    if (updates.stageEvidence) {
      if (updates.stageEvidence.length > 0) {
        const evidencesToUpsert = updates.stageEvidence.map(e => ({
          project_id: projectId,
          stage: e.stage,
          photos: e.photos,
          notes: e.notes,
          user_name: e.user,
          date: e.date
        }));

        const { error: stageError } = await supabase
          .from('stage_evidences')
          .upsert(evidencesToUpsert, { onConflict: 'project_id, stage' });

        if (stageError) console.error('Erro ao salvar evidências:', stageError);
      }
    }

    // 9. Atualização do estado local
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

  const deleteUnit = async (projectId: string, unitId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const unitToDelete = project.units.find(u => u.id === unitId);
    if (!unitToDelete) return;

    if (!window.confirm(`Tem certeza que deseja excluir a unidade "${unitToDelete.identifier}"?`)) return;

    // 1. Deletar do Supabase
    const { error } = await supabase
      .from('units')
      .delete()
      .eq('id', unitId);

    if (error) {
      alert('Erro ao excluir unidade: ' + error.message);
      return;
    }

    // 2. Atualizar estado local e recalcular totais do projeto
    const newUnits = project.units.filter(u => u.id !== unitId);
    const updates: Partial<Project> = {
      units: newUnits,
      expectedTotalCost: newUnits.reduce((a, b) => a + b.cost, 0),
      expectedTotalSales: newUnits.reduce((a, b) => a + (b.saleValue || b.valorEstimadoVenda || 0), 0)
    };

    // Atualizar tabela de projetos no banco com novos totais
    await supabase
      .from('projects')
      .update({
        expected_total_cost: updates.expectedTotalCost,
        expected_total_sales: updates.expectedTotalSales
      })
      .eq('id', projectId);

    // Atualizar estado local
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));

    // Log da exclusão
    await supabase.from('logs').insert([{
      id: generateId(),
      project_id: projectId,
      user_id: currentUser?.id,
      user_name: currentUser?.login,
      action: 'Exclusão',
      field: 'Unidade',
      old_value: unitToDelete.identifier,
      new_value: '-'
    }]);
  };

  const deleteProject = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (!window.confirm(`ATENÇÃO: Tem certeza que deseja excluir a obra "${project.name}"?\n\nEsta ação apagará TODAS as unidades, despesas e históricos associados.\n\nEssa ação não pode ser desfeita.`)) return;

    // Supabase deve estar configurado com ON DELETE CASCADE, mas por segurança tentamos deletar o projeto direto
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Erro ao excluir projeto:', error);
      alert('Erro ao excluir projeto: ' + error.message);
      return;
    }

    setProjects(prev => prev.filter(p => p.id !== projectId));

    // Se o projeto excluído estava selecionado, voltar para lista
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
  };

  // Função para adicionar despesa diretamente a um projeto (usada pelo botão rápido)
  const addExpenseToProject = async (projectId: string, expense: Omit<Expense, 'id' | 'userId' | 'userName'>) => {
    const newExpense: Expense = {
      id: generateId(),
      ...expense,
      userId: currentUser?.id || '',
      userName: currentUser?.login || 'Sistema'
    };

    // Inserir no Supabase
    const { error } = await supabase.from('expenses').insert([{
      id: newExpense.id,
      project_id: projectId,
      description: newExpense.description,
      value: newExpense.value,
      date: newExpense.date,
      user_id: newExpense.userId,
      user_name: newExpense.userName,
      attachment_url: newExpense.attachmentUrl
    }]);

    if (error) {
      alert('Erro ao adicionar despesa: ' + error.message);
      console.error('Erro ao adicionar despesa:', error);
      return;
    }

    // Atualizar estado local
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        return { ...p, expenses: [...p.expenses, newExpense] };
      }
      return p;
    }));

    // Log da adição
    await supabase.from('logs').insert([{
      id: generateId(),
      project_id: projectId,
      user_id: currentUser?.id,
      user_name: currentUser?.login,
      action: 'Inclusão',
      field: 'Despesa',
      old_value: '-',
      new_value: `${newExpense.description}: R$ ${newExpense.value.toFixed(2)}`
    }]);
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
    <div className="flex min-h-screen bg-slate-900 font-sans">
      <Sidebar
        role={currentUser.role}
        activeTab={activeTab}
        setActiveTab={(tab) => { setActiveTab(tab); setSelectedProjectId(null); }}
        onLogout={logout}
      />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {activeTab === 'projects' && (selectedProjectId && selectedProject ? selectedProject.name : 'Obras')}
              {activeTab === 'general' && selectedProjectId && selectedProject ? selectedProject.name : ''}
              {activeTab === 'users' && 'Gestão de Usuários'}
            </h1>
            {selectedProject && selectedProjectId ? (
              <div className="flex items-center gap-4 mt-1">
                <span className="text-green-400 font-semibold text-sm">
                  <i className="fa-solid fa-check-circle mr-1"></i>
                  {selectedProject.units.filter(u => u.status === 'Sold').length} vendidas
                </span>
                <span className="text-blue-400 font-semibold text-sm">
                  <i className="fa-solid fa-tag mr-1"></i>
                  {selectedProject.units.filter(u => u.status === 'Available').length} à venda
                </span>
              </div>
            ) : activeTab === 'users' ? (
              <p className="text-slate-400">Bem-vindo, {currentUser.login}</p>
            ) : null}
          </div>
          {selectedProjectId && (
            <button
              onClick={() => setSelectedProjectId(null)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition shadow-sm"
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
              onDeleteUnit={deleteUnit}
            />
          ) : (
            <ProjectsDashboard
              projects={filteredProjects}
              onSelect={setSelectedProjectId}
              onAdd={addProject}
              onUpdate={updateProject}
              onDelete={deleteProject}
              isAdmin={currentUser.role === UserRole.ADMIN}
            />
          )
        )}

        {activeTab === 'general' && !selectedProjectId && (
          <GeneralDashboard
            projects={filteredProjects}
            userName={currentUser.login}
            userId={currentUser.id}
            onSelectProject={setSelectedProjectId}
            onAddProject={addProject}
            onUpdate={updateProject}
            onDelete={deleteProject}
            onAddExpense={addExpenseToProject}
            isAdmin={currentUser.role === UserRole.ADMIN}
          />
        )}

        {activeTab === 'general' && selectedProjectId && selectedProject && (
          <ProjectDetail
            project={selectedProject}
            user={currentUser}
            onUpdate={updateProject}
            onDeleteUnit={deleteUnit}
          />
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

      <MobileNav
        role={currentUser.role}
        activeTab={activeTab}
        setActiveTab={(tab) => { setActiveTab(tab); setSelectedProjectId(null); }}
        onLogout={logout}
      />
    </div>
  );
};

export default App;
