import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatCurrency } from '../utils';

interface Props {
    value: number;
    /** Cor/peso do texto — o tamanho quem manda é o ajuste automático. */
    className?: string;
    /** Tamanho ideal, em px: o que o card usaria se o número coubesse folgado. */
    size?: number;
    /** Piso: abaixo disto não encolhe mais (melhor apertar do que virar borrão). */
    min?: number;
    /** Texto no lugar do valor (ex.: "—" quando ainda não há venda). */
    placeholder?: string;
    /** Alinhamento dentro do card. */
    align?: 'left' | 'center' | 'right';
}

/**
 * DINHEIRO POR EXTENSO QUE NÃO ESTOURA O CARD.
 *
 * Abreviar mente: "31k" no lugar de R$ 30.709,92 fez um sócio ler R$ 300 a mais
 * do que a obra tinha, e "1,2M" esconde R$ 40 mil. A regra virou "dinheiro que
 * decide não se abrevia" — mas por extenso o número é longo e estourava o card.
 *
 * Aqui ele MEDE a largura real que tem e diminui a letra só o quanto precisar.
 * Ninguém precisa acertar o tamanho no chute por tela: em card largo sai grande,
 * em card estreito sai menor, e o valor continua inteiro e exato.
 */
const MoneyFit: React.FC<Props> = ({ value, className = '', size = 20, min = 10, placeholder, align = 'left' }) => {
    const boxRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [fontSize, setFontSize] = useState(size);
    const text = placeholder ?? formatCurrency(value);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const el = textRef.current;
        if (!box || !el) return;

        const fit = () => {
            const available = box.clientWidth;
            if (!available) return;   // ainda não desenhado (aba fechada) — o observer chama de novo
            // Mede sempre no tamanho ideal: assim o número volta a crescer quando
            // a tela gira ou o card ganha espaço, em vez de ficar pequeno pra sempre.
            el.style.fontSize = `${size}px`;
            const needed = el.scrollWidth;
            if (needed <= available) { setFontSize(size); return; }
            // Largura anda junto com o tamanho da letra, então uma regra de três já
            // acerta. O 0.99 é a folga pro arredondamento do navegador.
            setFontSize(Math.max(min, Math.floor(size * (available / needed) * 0.99)));
        };

        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(box);
        return () => ro.disconnect();
    }, [text, size, min]);

    const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    return (
        <span ref={boxRef} className={`flex w-full min-w-0 font-black leading-none tabular-nums ${className}`} style={{ justifyContent: justify }}>
            <span ref={textRef} className="whitespace-nowrap" style={{ fontSize: `${fontSize}px` }}>{text}</span>
        </span>
    );
};

export default MoneyFit;
