import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { User, UserRole, Project, ProgressStage, LogEntry, Unit, Expense } from './types';
import { INITIAL_ADMIN } from './constants';
import { generateId } from './utils';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from './hooks/useProjects';

// Pages (Sync - Critical for initial load)
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import ReloadPrompt from './components/ReloadPrompt';
import { SyncStatus } from './components/SyncStatus';

// Pages (Lazy - Deferred until after login)
const ProjectsDashboard = lazy(() => import('./components/ProjectsDashboard'));
const ProjectDetail = lazy(() => import('./components/ProjectDetail'));
const GeneralDashboard = lazy(() => import('./components/GeneralDashboard'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const AuditPage = lazy(() => import('./components/AuditPage'));
const InvestorView = lazy(() => import('./components/InvestorView'));
const AICopilot = lazy(() => import('./components/AICopilot'));
const QuickExpenseModal = lazy(() => import('./components/QuickExpenseModal'));
const QuickDiaryModal = lazy(() => import('./components/QuickDiaryModal'));
const QuickUnitModal = lazy(() => import('./components/QuickUnitModal'));

import { useNotifications } from './hooks/useNotifications';

// Helper to parse investor route from hash
const parseInvestorRoute = (): string | null => {
  const hash = window.location.hash;
  const match = hash.match(/^#\/investor\/([a-zA-Z0-9-]+)$/);
  return match ? match[1] : null;
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // Nova flag de carregamento
  const [debugError, setDebugError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'projects' | 'general' | 'users' | 'audit'>('general');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([INITIAL_ADMIN]);

  const { data: projects = [], refetch: refreshProjects } = useProjects();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();

  const isLoaded = useRef(false);
  const [investorProjectId, setInvestorProjectId] = useState<string | null>(parseInvestorRoute());

  useEffect(() => {
    const handleHashChange = () => {
      setInvestorProjectId(parseInvestorRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 1. Monitoramento de Sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setAuthLoading(false); // Se não tem sessão, para de carregar
    }).catch(err => setDebugError(err.message));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Mapeamento de Usuário e Perfil
  useEffect(() => {
    let mounted = true;

    const fetchProfile = async () => {
      if (session?.user) {
        setAuthLoading(true);
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (error) {
            console.error('Erro Profile Supabase:', error);
            // setDebugError(`Erro ao buscar perfil: ${error.message} (${error.code})`);
            // Se der erro (ex: RLS bloqueando), tenta continuar como user padrão
          }

          if (mounted) {
            if (profile) {
              // Normalizar role para maiúsculo para bater com o Enum
              const dbRole = (profile.role || '').toUpperCase();

              setCurrentUser({
                id: session.user.id,
                login: profile.email ? profile.email.split('@')[0] : 'Usuário',
                password: '',
                role: dbRole === 'ADMIN' ? UserRole.ADMIN : UserRole.STANDARD,
                allowedProjectIds: [],
                canSeeUnits: true
              });
            } else {
              // Fallback
              const userEmail = session.user.email || '';
              setCurrentUser({
                id: session.user.id,
                login: userEmail.split('@')[0],
                password: '',
                role: UserRole.STANDARD, // Downgrade seguro
                allowedProjectIds: [],
                canSeeUnits: true
              });
            }
          }
        } catch (error: any) {
          console.error('Erro Fatal FetchProfile:', error);
          setDebugError(`Erro Fatal: ${error.message}`);
        } finally {
          if (mounted) setAuthLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [session]);

  // 2.1 Notificações (Restored)
  const { requestPermission } = useNotifications(projects);

  // Solicitar permissão ao carregar se tiver usuário
  useEffect(() => {
    if (currentUser) {
      requestPermission();
    }
  }, [currentUser]);

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
    try {
      await createProjectMutation.mutateAsync({
        ...project,
        id: generateId(),
        userId: currentUser?.id || '',
        userName: currentUser?.login || 'Usuário'
      });
    } catch (error: any) {
      if (error.message.includes('Load failed') || error.message.includes('Failed to fetch')) {
        console.warn('Operação salva offline (erro de rede suprimido):', error.message);
      } else {
        alert('Erro ao adicionar projeto: ' + error.message);
      }
    }
  };

  const addUnitToProject = async (projectId: string, unit: Omit<Unit, 'id'>) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newUnit: Unit = {
      id: generateId(),
      ...unit
    } as Unit;

    const newUnits = [...project.units, newUnit];

    // Recalcular totais
    const expectedTotalCost = newUnits.reduce((a, b) => a + b.cost, 0);
    const expectedTotalSales = newUnits.reduce((a, b) => a + (b.saleValue || b.valorEstimadoVenda || 0), 0);

    await updateProject(projectId, {
      units: newUnits,
      expectedTotalCost,
      expectedTotalSales
    }, `Inclusão Unidade (Voz): ${newUnit.identifier}`);
  };

  const updateProject = async (projectId: string, updates: Partial<Project>, logMsg?: string) => {
    try {
      await updateProjectMutation.mutateAsync({
        id: projectId,
        updates,
        logMsg,
        user: currentUser ? { id: currentUser.id, name: currentUser.login! } : undefined
      });
    } catch (error: any) {
      if (error.message.includes('Load failed') || error.message.includes('Failed to fetch')) {
        console.warn('Operação salva offline (erro de rede suprimido):', error.message);
      } else {
        console.error('Erro ao atualizar projeto:', error);
        alert('Erro ao atualizar projeto: ' + error.message);
      }
    }
  };

  const deleteUnit = async (projectId: string, unitId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const unitToDelete = project.units.find(u => u.id === unitId);
    if (!unitToDelete) return;

    if (!window.confirm(`Tem certeza que deseja excluir a unidade "${unitToDelete.identifier}"?`)) return;

    const newUnits = project.units.filter(u => u.id !== unitId);
    // Recalculate totals
    const expectedTotalCost = newUnits.reduce((a, b) => a + b.cost, 0);
    const expectedTotalSales = newUnits.reduce((a, b) => a + (b.saleValue || b.valorEstimadoVenda || 0), 0);

    await updateProject(projectId, {
      units: newUnits,
      expectedTotalCost,
      expectedTotalSales
    }, `Exclusão Unidade: ${unitToDelete.identifier}`);
  };

  const deleteProject = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (!window.confirm(`ATENÇÃO: Tem certeza que deseja excluir a obra "${project.name}"?\n\nEsta ação apagará TODAS as unidades, despesas e históricos associados.\n\nEssa ação não pode ser desfeita.`)) return;

    try {
      await deleteProjectMutation.mutateAsync(projectId);

      // Se o projeto excluído estava selecionado, voltar para lista
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }
    } catch (error: any) {
      if (error.message.includes('Load failed') || error.message.includes('Failed to fetch')) {
        console.warn('Operação salva offline (erro de rede suprimido):', error.message);
      } else {
        console.error('Erro ao excluir projeto:', error);
        alert('Erro ao excluir projeto: ' + error.message);
      }
    }
  };

  // Função para adicionar despesa diretamente a um projeto (usada pelo botão rápido)
  const addExpenseToProject = async (projectId: string, expense: Omit<Expense, 'id' | 'userId' | 'userName'>) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newExpense: Expense = {
      id: generateId(),
      ...expense,
      userId: currentUser?.id || '',
      userName: currentUser?.login || 'Sistema'
    };

    await updateProject(projectId, {
      expenses: [...project.expenses, newExpense]
    }, `Inclusão Despesa: ${newExpense.description} - R$ ${newExpense.value}`);
  };

  // --- Voice Assistant Integration ---
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  const [isQuickDiaryOpen, setIsQuickDiaryOpen] = useState(false);
  const [isQuickUnitOpen, setIsQuickUnitOpen] = useState(false);
  const [voiceInitialData, setVoiceInitialData] = useState<any>({});

  const [voiceTrigger, setVoiceTrigger] = useState(0);

  const handleVoiceNavigate = (tab: string) => {
    if (tab === 'projects') {
      setActiveTab('projects');
      setSelectedProjectId(null);
    } else if (tab === 'general') {
      setActiveTab('general');
      setSelectedProjectId(null);
    } else if (tab === 'users') {
      setActiveTab('users');
    } else if (tab === 'audit') {
      setActiveTab('audit');
      setSelectedProjectId(null);
    }
  };

  const handleVoiceAction = (action: string, data?: any) => {
    console.log('AI Action:', action, data);

    // Se a IA identificou um projeto, vamos focar nele automaticamente
    if (data?.projectId) {
      const exists = projects.some(p => p.id === data.projectId);
      if (exists) {
        setSelectedProjectId(data.projectId);
      }
    }

    if (action === 'ADD_EXPENSE') {
      setVoiceInitialData({
        description: data?.description || data?.text || '',
        value: data?.value || data?.estimatedValue || 0,
        originalText: data?.text || ''
      });
      setIsQuickExpenseOpen(true);
    } else if (action === 'ADD_DIARY') {
      setVoiceInitialData({
        content: data?.content || data?.text?.replace(/^diário\s+/i, '') || ''
      });
      setIsQuickDiaryOpen(true);
    } else if (action === 'NAVIGATE') {
      if (data?.tab) {
        handleVoiceNavigate(data.tab);
      } else if (data?.projectId) {
        setActiveTab('general');
      }
    } else if (action === 'ADD_UNIT') {
      setVoiceInitialData({
        identifier: data?.identifier || data?.name || '',
        area: data?.area || 0,
        cost: data?.cost || 0,
        salePrice: data?.salePrice || 0
      });
      setIsQuickUnitOpen(true);
    }
  };

  const handleSaveQuickDiary = async (projectId: string, entry: any) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newEntry = {
      id: generateId(),
      project_id: projectId,
      date: entry.date,
      content: entry.content,
      photos: entry.photos || [],
      author: currentUser?.login || 'Usuário', // Force current user
      user_id: currentUser?.id,
      created_at: new Date().toISOString()
    };

    const localEntry = {
      id: newEntry.id,
      date: newEntry.date,
      content: newEntry.content,
      photos: newEntry.photos,
      author: newEntry.author,
      createdAt: newEntry.created_at
    };

    await updateProject(projectId, {
      diary: [...project.diary, localEntry]
    }, 'Inclusão Diário (Voz)');

    setIsQuickDiaryOpen(false);
  };

  const handleUpdateDiary = async (projectId: string, entry: any) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newDiary = project.diary.map(d => d.id === entry.id ? { ...d, ...entry } : d);

    await updateProject(projectId, {
      diary: newDiary
    }, 'Atualização Diário');
  };

  const handleDeleteDiary = async (projectId: string, entryId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro do diário?')) return;

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newDiary = project.diary.filter(d => d.id !== entryId);

    await updateProject(projectId, {
      diary: newDiary
    }, 'Exclusão Diário');
  };


  const filteredProjects = useMemo(() => {
    if (!currentUser) return [];
    // RLS já filtra no backend. O frontend mostra tudo que chegou.
    return projects;
  }, [projects, currentUser]);

  // Se estiver carregando, mostra tela de loading (MOVED TO BOTTOM)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="font-bold text-lg">Carregando sistema...</p>
        {debugError && (
          <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm max-w-md break-words">
            <p className="font-bold">Erro detectado:</p>
            {debugError}
          </div>
        )}
      </div>
    );
  }

  // Investor Mode - Public route (no auth required)
  if (investorProjectId) {
    return <InvestorView projectId={investorProjectId} />;
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId);



  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="font-bold text-lg">Carregando módulos...</p>
      </div>
    }>
      <div className="flex h-[100dvh] overflow-hidden bg-slate-900 font-sans fixed inset-0">
        <Sidebar
          role={currentUser.role}
          activeTab={activeTab}
          setActiveTab={(tab) => { setActiveTab(tab); setSelectedProjectId(null); }}
          onLogout={logout}
          onTriggerAI={() => setVoiceTrigger(prev => prev + 1)}
        />

        <main className="flex-1 px-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
          <header className="mb-0 md:mb-8 flex justify-between items-center p-4 md:p-0 bg-transparent sticky top-0 z-30 pointer-events-none">
            <div className="pointer-events-auto flex flex-col md:flex-row md:items-center gap-4">
              {/* Sync Status Indicator */}
              <SyncStatus />

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
            </div>

            {activeTab === 'general' && !selectedProjectId && (
              <div className="flex flex-col gap-1 items-end text-right">
                <h1 className="text-2xl font-black text-white italic tracking-tight truncate">
                  Olá, {currentUser?.login || 'Usuário'}!
                </h1>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-none">
                  {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}

            {selectedProjectId && (
              <button
                onClick={() => setSelectedProjectId(null)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition shadow-sm pointer-events-auto"
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
                onRefresh={refreshProjects}
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

          {activeTab === 'audit' && (
            <AuditPage projects={projects} />
          )}

          {activeTab === 'general' && selectedProjectId && selectedProject && (
            <ProjectDetail
              project={selectedProject}
              user={currentUser}
              onUpdate={updateProject}
              onDeleteUnit={deleteUnit}
              onRefresh={refreshProjects}
              onUpdateDiary={handleUpdateDiary}
              onDeleteDiary={handleDeleteDiary}
            />
          )}

          {activeTab === 'users' && currentUser.role === UserRole.ADMIN && (
            <UserManagement
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
          onTriggerAI={() => setVoiceTrigger(prev => prev + 1)}
        />

        <AICopilot
          currentProjectId={selectedProjectId}
          onAction={handleVoiceAction}
          triggerVoice={voiceTrigger}
        />

        <QuickExpenseModal
          isOpen={isQuickExpenseOpen}
          onClose={() => setIsQuickExpenseOpen(false)}
          projects={filteredProjects}
          preSelectedProjectId={selectedProjectId}
          onSave={addExpenseToProject}
          initialDescription={voiceInitialData?.description}
          initialValue={voiceInitialData?.value}
          initialOriginalText={voiceInitialData?.originalText}
        />

        <QuickDiaryModal
          isOpen={isQuickDiaryOpen}
          onClose={() => setIsQuickDiaryOpen(false)}
          projects={filteredProjects}
          preSelectedProjectId={selectedProjectId}
          onSave={handleSaveQuickDiary}
          initialContent={voiceInitialData?.content}
        />

        <QuickUnitModal
          isOpen={isQuickUnitOpen}
          onClose={() => setIsQuickUnitOpen(false)}
          projects={filteredProjects}
          preSelectedProjectId={selectedProjectId}
          onSave={addUnitToProject}
          initialIdentifier={voiceInitialData?.identifier}
          initialArea={voiceInitialData?.area}
          initialCost={voiceInitialData?.cost}
          initialSalePrice={voiceInitialData?.salePrice}
        />

        <ReloadPrompt />
      </div>
    </Suspense>
  );
};

export default App;
