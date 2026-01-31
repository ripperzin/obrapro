-- Adicionar coluna de telefone na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone text UNIQUE;

-- Criar índice para busca rápida por telefone (usado no webhook)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

-- Comentário: O formato deve ser E.164 (ex: +5511999999999) para bater com o Twilio
