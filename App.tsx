
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, UserRole, Project, ProgressStage, LogEntry, Unit, Expense } from './types';
import { INITIAL_ADMIN } from './constants';
import { generateId } from './utils';

// Pages
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import ProjectsDashboard from './components/ProjectsDashboard';
import ProjectDetail from './components/ProjectDetail';
import GeneralDashboard from './components/GeneralDashboard';
import UserManagement from './components/UserManagement';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'projects' | 'general' | 'users'>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const [users, setUsers] = useState<User[]>([INITIAL_ADMIN]);
  const [projects, setProjects] = useState<Project[]>([]);
  const isLoaded = useRef(false); // Flag de blindagem

  // Carregamento inicial único
  useEffect(() => {
    const savedProjects = localStorage.getItem('obras_projects');
    const savedUsers = localStorage.getItem('obras_users');
    if (savedProjects) setProjects(JSON.parse(savedProjects));
    if (savedUsers) setUsers(JSON.parse(savedUsers));
    isLoaded.current = true; // Confirmação de carga
  }, []);

  // Salvamento condicional apenas após carga
  useEffect(() => {
    if (isLoaded.current) {
      localStorage.setItem('obras_projects', JSON.stringify(projects));
      localStorage.setItem('obras_users', JSON.stringify(users));
    }
  }, [projects, users]);

  const handleLogin = (login: string, pass: string) => {
    const user = users.find(u => u.login === login && u.password === pass);
    if (user) {
      setCurrentUser(user);
    } else {
      alert('Login ou senha incorretos');
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setSelectedProjectId(null);
  };

  const addProject = (project: Omit<Project, 'id' | 'units' | 'expenses' | 'logs'>) => {
    const newProject: Project = {
      ...project,
      id: generateId(),
      units: [],
      expenses: [],
      logs: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'sys',
        userName: currentUser?.login || 'Sistema',
        action: 'Criação',
        field: 'Projeto',
        oldValue: '-',
        newValue: project.name
      }]
    };
    setProjects([...projects, newProject]);
  };

  const updateProject = (projectId: string, updates: Partial<Project>, logMsg?: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        const updated = { ...p, ...updates };
        if (logMsg) {
          updated.logs = [...p.logs, {
            id: generateId(),
            timestamp: new Date().toISOString(),
            userId: currentUser?.id || '',
            userName: currentUser?.login || '',
            action: 'Alteração',
            field: 'Geral',
            oldValue: 'vários',
            newValue: logMsg
          }];
        }
        return updated;
      }
      return p;
    }));
  };

  const filteredProjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === UserRole.ADMIN) return projects;
    return projects.filter(p => currentUser.allowedProjectIds.includes(p.id));
  }, [projects, currentUser]);

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
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
