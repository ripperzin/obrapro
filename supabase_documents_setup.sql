-- 1. Criação da Tabela de Documentos
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  title text not null,
  category text not null check (category in ('Projeto', 'Escritura', 'Contrato', 'Outros')),
  url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativar RLS
alter table documents enable row level security;

-- Policies para Documentos (permitindo acesso a todos usuários autenticados por enquanto)
-- Leitura
create policy "Usuários autenticados podem ver documentos"
on documents for select
to authenticated
using (true);

-- Inserção
create policy "Usuários autenticados podem adicionar documentos"
on documents for insert
to authenticated
with check (true);

-- Exclusão
create policy "Usuários autenticados podem excluir documentos"
on documents for delete
to authenticated
using (true);

-- 2. Criação do Bucket de Storage
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

-- Policies de Storage para o novo bucket 'project-documents'
-- Leitura
create policy "Leitura de documentos autenticada"
on storage.objects for select
to authenticated
using ( bucket_id = 'project-documents' );

-- Upload
create policy "Upload de documentos autenticada"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'project-documents' );

-- Exclusão (opcional, mas recomendado)
create policy "Exclusão de documentos autenticada"
on storage.objects for delete
to authenticated
using ( bucket_id = 'project-documents' );
