import React, { useState } from 'react';

/**
 * Card expansível padrão da aba Despesas (Terreno / Construção). Cabeçalho
 * clicável = ícone + título + um slot à direita (total, contagem) + seta. O
 * corpo recolhe. Mantém os dois cards do MESMO tamanho e padrão.
 */
const ExpandableCard: React.FC<{
  title: string;
  icon: string;
  iconColor?: string;       // ex.: 'text-amber-400'
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, iconColor = 'text-slate-400', headerRight, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass rounded-2xl border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-slate-800/30 transition"
      >
        <h3 className="font-black text-white text-lg uppercase tracking-tight flex items-center gap-3 min-w-0">
          <i className={`fa-solid ${icon} ${iconColor} shrink-0`}></i>
          <span className="truncate">{title}</span>
        </h3>
        <div className="flex items-center gap-3 shrink-0">
          {headerRight}
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-slate-500`}></i>
        </div>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
};

export default ExpandableCard;
