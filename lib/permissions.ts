import { User, Project } from '../types';

// =====================================================
// Cargo por OBRA (modelo de contas — Fase 2)
// =====================================================
// Cada pessoa tem um cargo NA OBRA (project_members.role):
//   'owner'     = Dono da obra (quem criou). Vê e faz tudo.
//   'gestor'    = braço direito. Faz tudo na obra, só não apaga a obra nem
//                 mexe na equipe (isso já é travado pelo banco).
//   'apontador' = do campo. Só LANÇA despesa (+foto) e AVANÇA etapa (+foto).
//                 NÃO vê dinheiro (caixa, resultado, sócios, orçamento, valores).
export type ProjectRole = 'owner' | 'gestor' | 'apontador';

// Mapa "obra -> meu cargo nela". Montado no App a partir de project_members.
export type MyRoles = Record<string, ProjectRole | undefined>;

export const roleInProject = (myRoles: MyRoles | undefined, projectId: string): ProjectRole | undefined =>
  myRoles?.[projectId];

// Pode ver o DINHEIRO da obra? Todos menos o apontador. Default true quando o
// cargo é desconhecido — assim owner/gestor (e o app antes do cargo carregar)
// nunca perdem a visão; só o apontador é restrito.
export const canSeeMoney = (myRoles: MyRoles | undefined, projectId: string): boolean =>
  roleInProject(myRoles, projectId) !== 'apontador';

// Todo membro pode LANÇAR (despesa + avançar etapa), inclusive o apontador.
export const canLancar = (_role?: ProjectRole): boolean => true;

// Poder de EDIÇÃO por obra (editar/excluir, orçamento, sócios, import/export,
// concluir obra). É o ponto de extensão único; o apontador NÃO edita.
//
// O 3º parâmetro `role` é opcional: quando não é passado (ou é owner/gestor),
// devolve `true` — as chamadas antigas e a visão do dono/gestor ficam idênticas.
export const canEditProject = (_user?: User | null, _project?: Project, role?: ProjectRole): boolean =>
  role !== 'apontador';
