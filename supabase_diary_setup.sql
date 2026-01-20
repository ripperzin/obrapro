-- Tabela de Diário de Obra
create table if not exists diary_entries (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  date date not null,
  content text not null,
  photos text[] default '{}',
  author text,
  user_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table diary_entries enable row level security;

-- Policies
create policy "Usuários autenticados podem ver diário"
on diary_entries for select to authenticated using (true);

create policy "Usuários autenticados podem criar entradas no diário"
on diary_entries for insert to authenticated with check (true);

create policy "Usuários autenticados podem atualizar diário"
on diary_entries for update to authenticated using (true) with check (true);

create policy "Usuários autenticados podem excluir entradas do diário"
on diary_entries for delete to authenticated using (true);
