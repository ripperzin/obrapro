-- Adiciona a coluna 'attachments' na tabela 'expenses' se ainda não existir
-- Armazena um array de strings (URLs ou caminhos)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'attachments') THEN 
        ALTER TABLE expenses ADD COLUMN attachments text[] DEFAULT '{}'; 
    END IF; 
END $$;
