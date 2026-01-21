-- Tabela de Comprovação de Etapas (Fotos por Etapa)
create table if not exists stage_evidences (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  stage integer not null, -- 0, 10, 20...
  photos text[] default '{}',
  notes text,
  user_name text,
  date date not null default CURRENT_DATE,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, stage)
);

-- RLS
alter table stage_evidences enable row level security;

-- Policies
create policy "Usuários autenticados podem ver evidencias"
on stage_evidences for select to authenticated using (true);

create policy "Usuários autenticados podem gerenciar evidencias"
on stage_evidences for all to authenticated using (true) with check (true);

-- Forçar refresh do schema cache
NOTIFY pgrst, 'reload config';
