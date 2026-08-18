import { useEffect, useRef, useState } from 'react';

/**
 * "Puxe para atualizar" — arrastar a tela pra baixo no celular.
 *
 * Por que existe: instalado na tela do celular, o app abre em tela cheia, e ali
 * o navegador NÃO oferece o puxar-pra-atualizar dele. Pior: com o service
 * worker, a versão nova baixa em segundo plano e só entra na abertura SEGUINTE
 * — então a pessoa testa a versão de ontem sem saber (aconteceu 3× em 17-18/08
 * e quase estragou dois diagnósticos). Ao soltar, mandamos o service worker
 * procurar versão nova ANTES de recarregar: o gesto vira "me dá a mais nova".
 *
 * ⚠️ Os ouvintes ficam no `document`, não no elemento. A 1ª versão prendia no
 * elemento dentro do efeito — e no arranque do app o efeito roda enquanto a
 * tela ainda é a de "carregando", quando esse elemento AINDA NÃO EXISTE. O
 * efeito saía sem ligar nada e nunca mais rodava: o gesto não funcionava nunca.
 * No document dá pra resolver o elemento na hora do toque, quando ele já existe.
 */
export function usePullToRefresh(ref: React.RefObject<HTMLElement | null>) {
    const [puxada, setPuxada] = useState(0);          // px já puxados (pra desenhar)
    const [recarregando, setRecarregando] = useState(false);
    const puxadaRef = useRef(0);
    const recarregandoRef = useRef(false);

    useEffect(() => {
        const LIMITE = 70;       // quanto precisa puxar pra valer
        const RESISTENCIA = 0.5; // dedo anda 2px, tela desce 1 — sensação de elástico
        let inicioY: number | null = null;

        const marcar = (v: number) => { puxadaRef.current = v; setPuxada(v); };

        const inicio = (e: TouchEvent) => {
            const el = ref.current;
            inicioY = null;
            if (!el || recarregandoRef.current) return;
            // Só vale se o toque começou DENTRO da área de conteúdo e ela já
            // está no topo — puxar no meio da lista continua rolando normal.
            const alvo = e.target as Node | null;
            if (!alvo || !el.contains(alvo)) return;
            if (el.scrollTop > 0) return;
            inicioY = e.touches[0].clientY;
        };

        const mover = (e: TouchEvent) => {
            const el = ref.current;
            if (inicioY === null || !el || recarregandoRef.current) return;
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
                const reg = await navigator.serviceWorker?.getRegistration();
                if (reg) {
                    await reg.update();          // procura versão nova no servidor
                    // O app está em modo "perguntar antes de atualizar", então a
                    // versão nova fica ESPERANDO. Só recarregar não adianta — a
                    // versão velha continua servindo. Aqui damos a ordem de troca
                    // (o mesmo que o botão "Atualizar Agora" faz) e esperamos ela
                    // assumir antes de recarregar.
                    const esperando = reg.waiting;
                    if (esperando) {
                        esperando.postMessage({ type: 'SKIP_WAITING' });
                        await new Promise<void>((resolve) => {
                            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
                            setTimeout(resolve, 2000);   // não deixa travar se algo der errado
                        });
                    }
                }
            } catch { /* sem service worker ou sem sinal: recarrega assim mesmo */ }
            window.location.reload();
        };

        document.addEventListener('touchstart', inicio, { passive: true });
        document.addEventListener('touchmove', mover, { passive: true });
        document.addEventListener('touchend', soltar, { passive: true });
        document.addEventListener('touchcancel', soltar, { passive: true });
        return () => {
            document.removeEventListener('touchstart', inicio);
            document.removeEventListener('touchmove', mover);
            document.removeEventListener('touchend', soltar);
            document.removeEventListener('touchcancel', soltar);
        };
    }, [ref]);

    return { puxada, recarregando, limite: 70 };
}
