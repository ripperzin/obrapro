-- Desbloquear acesso aos arquivos (Storage) para o Portal do Investidor
-- Necessário para que usuários sem login possam ver as fotos e anexos

-- 1. Permitir visualização (Select) no bucket 'project-documents' (Fotos das etapas)
create policy "Public Access to Project Documents"
on storage.objects for select
to anon
using ( bucket_id = 'project-documents' );

-- 2. Permitir visualização (Select) no bucket 'expense-attachments' (Anexos de despesas)
create policy "Public Access to Expense Attachments"
on storage.objects for select
to anon
using ( bucket_id = 'expense-attachments' );

-- OBS: Se os buckets não existirem ou tiverem outro nome, o comando apenas não terá efeito prático nesses buckets, sem erro crítico.
