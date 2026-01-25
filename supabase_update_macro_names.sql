-- Update Template Macros (for future projects)
UPDATE template_macros SET name = 'Projetos e Engenharia' WHERE name = 'Serviços Técnicos';
UPDATE template_macros SET name = 'Taxas e Papelada' WHERE name = 'Documentação';
UPDATE template_macros SET name = 'Fundação e Alicerce' WHERE name = 'Infra e Fundação';
UPDATE template_macros SET name = 'Estrutura e Concreto' WHERE name = 'Supraestrutura';
UPDATE template_macros SET name = 'Paredes e Telhado' WHERE name = 'Alvenaria e Cobertura';
UPDATE template_macros SET name = 'Elétrica e Hidráulica' WHERE name = 'Instalações (MEP)';
UPDATE template_macros SET name = 'Acabamentos (Piso/Reboco/Pintura)' WHERE name = 'Acabamento';
UPDATE template_macros SET name = 'Despesas Gerais da Obra' WHERE name = 'Indiretos/Canteiro';
UPDATE template_macros SET name = 'Imprevistos' WHERE name = 'Reserva';

-- Update Project Macros (for existing projects)
UPDATE project_macros SET name = 'Projetos e Engenharia' WHERE name = 'Serviços Técnicos';
UPDATE project_macros SET name = 'Taxas e Papelada' WHERE name = 'Documentação';
UPDATE project_macros SET name = 'Fundação e Alicerce' WHERE name = 'Infra e Fundação';
UPDATE project_macros SET name = 'Estrutura e Concreto' WHERE name = 'Supraestrutura';
UPDATE project_macros SET name = 'Paredes e Telhado' WHERE name = 'Alvenaria e Cobertura';
UPDATE project_macros SET name = 'Elétrica e Hidráulica' WHERE name = 'Instalações (MEP)';
UPDATE project_macros SET name = 'Acabamentos (Piso/Reboco/Pintura)' WHERE name = 'Acabamento';
UPDATE project_macros SET name = 'Despesas Gerais da Obra' WHERE name = 'Indiretos/Canteiro';
UPDATE project_macros SET name = 'Imprevistos' WHERE name = 'Reserva';
