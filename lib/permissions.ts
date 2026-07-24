import { User, Project } from '../types';

// =====================================================
// Poder de edição por OBRA (modelo de contas)
// =====================================================
// Fase 1: quem está logado é DONO da própria conta e edita as obras que
// enxerga. O banco (RLS / can_access_project) só devolve as obras das quais a
// pessoa é membro, então "pode editar esta obra" é verdadeiro para qualquer
// usuário ativo. É isto que transforma o cliente de "só leitura" em dono.
//
// Antes, o app perguntava "é o Dono do App?" (role===ADMIN) para liberar a
// edição — o que deixava o cliente comum preso em leitura. O Dono do App
// continua sendo o único a ver o painel "Negócio" (isso NÃO passa por aqui).
//
// Fase 2 (funcionários/cargos): esta função passa a olhar o CARGO do usuário
// NAQUELA obra (mestre de obra / gestor / sócio-gestor / dono) e devolver os
// poderes conforme o cargo. O ponto de extensão é aqui — um lugar só.
export const canEditProject = (_user?: User | null, _project?: Project): boolean => true;
