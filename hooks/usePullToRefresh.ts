import { useEffect, useRef, useState } from 'react';

/**
 * "Puxe para atualizar" — o gesto de arrastar a tela pra baixo no celular.
 *
 * Por que existe: instalado na tela do celular, o app abre em tela cheia, e ali
 * o navegador NÃO oferece o puxar-pra-atualizar dele. Pior: com o service
 * worker, a versão nova baixa em segundo plano e só entra na abertura SEGUINTE
 * — então a pessoa testa a versão de ontem sem saber que está fazendo isso
 * (aconteceu 2× em 17/08, comigo e com o Victor, e quase estragou um
 * diagnóstico). Aqui, ao soltar, mandamos o service worker procurar versão nova
 * ANTES de recarregar: o gesto passa a ser "me dá a versão mais nova".
 *
 * Só reage quando a tela já está no topo — puxar no meio da lista continua
 * rolando normal.
 */
export function usePullToRefresh(ref: React.RefObject<HTMLElement | null>) {
    const [puxada, setPuxada] = useState(0);          // px já puxados (pra desenhar)
    const [recarregando, setRecarregando] = useState(false);
    const puxadaRef = useRef(0);
    const recarregandoRef = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const LIMITE = 70;      // quanto precisa puxar pra valer
        const RESISTENCIA = 0.5; // o dedo anda 2px, a tela desce 1 — dá a sensação de elástico
        let inicioY: number | null = null;

        const marcar = (v: number) => { puxadaRef.current = v; setPuxada(v); };

        const inicio = (e: TouchEvent) => {
            inicioY = el.scrollTop <= 0 ? e.touches[0].clientY : null;
        };

        const mover = (e: TouchEvent) => {
            if (inicioY === null || recarregandoRef.current) return;
            if (el.scrollTop > 0) { inicioY = null; marcar(0); return; }
            const d = e.touches[0].clientY - inicioY;
            marcar(d > 0 ? Math.min(d * RESISTENCIA, LIMITE + 25) : 0);
        };

        const soltar = async () => {
            if (inicioY === null) return;
            inicioY = null;
            if (puxadaRef.current < LIMITE) { marcar(0); return; }

            recarregandoRef.current = true;
            setRecarregando(true);
            try {
                // Pede ao service worker pra conferir se saiu versão nova. Sem
                // isto o reload só traria o que já estava em cache.
                const reg = await navigator.serviceWorker?.getRegistration();
                if (reg) await reg.update();
            } catch { /* sem service worker (ou sem sinal): recarrega assim mesmo */ }
            window.location.reload();
        };

        el.addEventListener('touchstart', inicio, { passive: true });
        el.addEventListener('touchmove', mover, { passive: true });
        el.addEventListener('touchend', soltar, { passive: true });
        el.addEventListener('touchcancel', soltar, { passive: true });
        return () => {
            el.removeEventListener('touchstart', inicio);
            el.removeEventListener('touchmove', mover);
            el.removeEventListener('touchend', soltar);
            el.removeEventListener('touchcancel', soltar);
        };
    }, [ref]);

    return { puxada, recarregando, limite: 70 };
}
