
import { useEffect, useState, useRef } from 'react';
import { Project, ProjectMacro } from '../types';

// Mostra um aviso no celular/computador SEM nunca derrubar o app.
//
// No Android o Chrome PROÍBE `new Notification(...)`: ele estoura
// "Illegal constructor. Use ServiceWorkerRegistration.showNotification()".
// Como esse aviso é disparado durante a montagem da tela, o erro subia até a
// tela de "Ops! Algo deu errado" e o app inteiro não abria no celular
// (foi o que aconteceu com o Wender em 21/08).
//
// A regra aqui: quem manda o aviso é o service worker (o jeito que o Android
// aceita); se não houver service worker, tenta o jeito antigo; e se qualquer
// coisa falhar, o aviso simplesmente não aparece. Aviso é enfeite — nunca pode
// ser o motivo de ninguém ficar sem o app.
const mostrarAviso = async (titulo: string, opcoes: NotificationOptions) => {
    try {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        if ('serviceWorker' in navigator) {
            const registro = await navigator.serviceWorker.getRegistration();
            if (registro) {
                await registro.showNotification(titulo, opcoes);
                return;
            }
        }

        new Notification(titulo, opcoes);
    } catch {
        // Silêncio proposital: não avisar é aceitável, quebrar o app não é.
    }
};

export const useNotifications = (projects: Project[]) => {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const checkedRef = useRef(false);

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        try {
            if ('Notification' in window) {
                const result = await Notification.requestPermission();
                setPermission(result);
                return result;
            }
        } catch {
            // Alguns navegadores (Safari no iPhone fora do app instalado) recusam
            // o pedido com erro. Seguimos sem aviso, em vez de quebrar a tela.
        }
        return 'denied';
    };

    const checkDeadlines = () => {
        if (permission !== 'granted') return;

        // Avoid running multiple times in same session immediately
        if (checkedRef.current) return;

        // Simple debounce with localStorage to run only once per hour/day
        const lastCheck = localStorage.getItem('lastNotificationCheck');
        const now = Date.now();
        if (lastCheck && now - parseInt(lastCheck) < 3600000) { // 1 hour cooldown
            return;
        }

        projects.forEach(project => {
            // 1. Cronogramas (Deadlines)
            if (project.deliveryDate && project.progress < 100) {
                const today = new Date();
                const delivery = new Date(project.deliveryDate + 'T00:00:00');
                const diffTime = delivery.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 7) {
                    void mostrarAviso(`Prazo Próximo: ${project.name}`, {
                        body: `A entrega está prevista para daqui a 1 semana.`,
                        icon: '/pwa-192x192.png'
                    });
                } else if (diffDays === 1) {
                    void mostrarAviso(`Entrega Amanhã: ${project.name}`, {
                        body: `O prazo de entrega é amanhã!`,
                        icon: '/pwa-192x192.png',
                        requireInteraction: true
                    });
                }
            }

            // 2. Orçamento (Budget Overrun)
            if (project.budget && project.budget.macros) {
                project.budget.macros.forEach((macro: ProjectMacro) => {
                    // Check if spent > estimated with 10% tolerance to avoid spam on small variances
                    if (macro.estimatedValue > 0 && macro.spentValue > macro.estimatedValue) {
                        // Check if we already notified about this specific macro recently (optional complexity, skipping for now)
                        const ratio = (macro.spentValue / macro.estimatedValue) * 100;
                        if (ratio > 100) {
                            void mostrarAviso(`Alerta Financeiro: ${project.name}`, {
                                body: `A macro "${macro.name}" estourou o orçamento em ${(ratio - 100).toFixed(0)}%.`,
                                icon: '/pwa-192x192.png'
                            });
                        }
                    }
                });
            }

            // 3. Diário de Obra (Inactivity)
            if (project.progress < 100) {
                // Find latest diary entry
                let lastEntryDate = project.startDate ? new Date(project.startDate) : new Date();
                if (project.diary && project.diary.length > 0) {
                    const sorted = [...project.diary].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    lastEntryDate = new Date(sorted[0].date);
                }

                const today = new Date();
                const diffTime = today.getTime() - lastEntryDate.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 3) {
                    void mostrarAviso(`Diário de Obra: ${project.name}`, {
                        body: `Faz ${diffDays} dias que não há novos registros no diário. Que tal atualizar?`,
                        icon: '/pwa-192x192.png'
                    });
                }
            }
        });

        // Update verify flag
        localStorage.setItem('lastNotificationCheck', now.toString());
        checkedRef.current = true;
    };

    // Check deadlines on load if permission granted
    useEffect(() => {
        if (projects.length > 0 && permission === 'granted') {
            checkDeadlines();
        }
    }, [projects, permission]);

    return {
        permission,
        requestPermission
    };
};
