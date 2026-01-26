import React, { useState, useRef, useEffect } from 'react';
import { Project } from '../types';
import StageThumbnail from './StageThumbnail';

interface SwipeableProjectItemProps {
    project: Project;
    sold: number;
    total: number;
    onSelect: (id: string) => void;
    onEdit: (p: Project) => void;
    onDelete: (id: string) => void;
    isAdmin: boolean;
}

const SwipeableProjectItem: React.FC<SwipeableProjectItemProps> = ({
    project,
    sold,
    total,
    onSelect,
    onEdit,
    onDelete,
    isAdmin
}) => {
    const [startX, setStartX] = useState(0);
    const [startY, setStartY] = useState(0);
    const [startTime, setStartTime] = useState(0);
    const [translateX, setTranslateX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const maxSwipe = -160;

    const handleTouchStart = (e: React.TouchEvent) => {
        setStartX(e.touches[0].clientX);
        setStartY(e.touches[0].clientY);
        setStartTime(Date.now());
        setIsSwiping(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isSwiping) return;
        const currentX = e.touches[0].clientX;
        const diffX = currentX - startX;

        // Se estivermos deslizando verticalmente mais que horizontalmente no início, podemos ignorar
        const currentY = e.touches[0].clientY;
        const diffY = Math.abs(currentY - startY);
        if (diffY > Math.abs(diffX) && translateX === 0) {
            setIsSwiping(false);
            return;
        }

        let newTranslate = isOpen ? maxSwipe + diffX : diffX;
        if (newTranslate > 0) newTranslate = 0;
        if (newTranslate < maxSwipe) newTranslate = maxSwipe;
        setTranslateX(newTranslate);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!isSwiping) return;
        setIsSwiping(false);

        const endTime = Date.now();
        const diffX = Math.abs(translateX - (isOpen ? maxSwipe : 0));
        const duration = endTime - startTime;

        // SE for um toque rápido e com quase nenhum movimento, tratamos como CLICK
        if (diffX < 10 && duration < 300) {
            if (isOpen) {
                setTranslateX(0);
                setIsOpen(false);
            } else {
                onSelect(project.id);
            }
            return;
        }

        // Caso contrário, decide se abre ou fecha baseado na posição final
        if (translateX < maxSwipe / 2) {
            setTranslateX(maxSwipe);
            setIsOpen(true);
        } else {
            setTranslateX(0);
            setIsOpen(false);
        }
    };

    const evidencesWithPhotos = (project.stageEvidence || [])
        .filter(e => e.photos && e.photos.length > 0)
        .sort((a, b) => b.stage - a.stage);
    const latestEvidence = evidencesWithPhotos[0];
    const photo = latestEvidence?.photos?.[0];

    return (
        <div className="relative overflow-hidden rounded-2xl mb-4 bg-slate-900 border border-slate-800">
            {/* Layer Inferior (Ações) - Only visible when swiping or open */}
            <div
                className={`absolute inset-0 flex justify-end transition-opacity duration-200 ${translateX === 0 && !isSwiping ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(project);
                        setTranslateX(0);
                        setIsOpen(false);
                    }}
                    className="w-20 h-full bg-blue-600 text-white flex flex-col items-center justify-center gap-1 active:bg-blue-700"
                >
                    <i className="fa-solid fa-pen text-lg"></i>
                    <span className="text-[10px] font-bold uppercase">Editar</span>
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(project.id);
                        setTranslateX(0);
                        setIsOpen(false);
                    }}
                    className="w-20 h-full bg-red-600 text-white flex flex-col items-center justify-center gap-1 active:bg-red-700"
                >
                    <i className="fa-solid fa-trash text-lg"></i>
                    <span className="text-[10px] font-bold uppercase">Excluir</span>
                </button>
            </div>

            {/* Layer Superior (Conteúdo) */}
            <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{ transform: `translateX(${translateX}px)` }}
                className={`relative w-full py-4 px-4 flex items-center gap-4 bg-slate-900 border-b border-slate-800 transition-transform duration-200 ease-out active:bg-slate-800`}
            >
                {photo ? (
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 border-blue-500/30">
                        <StageThumbnail photoPath={photo} className="w-full h-full" />
                    </div>
                ) : (
                    <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-building text-2xl text-slate-400"></i>
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{project.name}</p>
                    <p className="text-slate-400 text-sm">{sold} de {total} vendidas</p>
                </div>

                <div className="relative w-14 h-14 shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="28" cy="28" r="24" stroke="#334155" strokeWidth="4" fill="transparent" />
                        <circle
                            cx="28" cy="28" r="24"
                            stroke="#22c55e" strokeWidth="4" fill="transparent"
                            strokeDasharray={2 * Math.PI * 24}
                            strokeDashoffset={2 * Math.PI * 24 - (2 * Math.PI * 24 * project.progress / 100)}
                            strokeLinecap="round"
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-[10px]">
                        {project.progress}%
                    </span>
                </div>

                {!isOpen && <i className="fa-solid fa-chevron-right text-slate-500 ml-1"></i>}
            </div>
        </div>
    );
};

export default SwipeableProjectItem;
