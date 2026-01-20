import React, { useState, useEffect } from 'react';

interface MoneyInputProps {
    value: number;
    onChange?: (value: number) => void; // Tornando opcional para permitir uso apenas com onBlur
    onBlur?: (value: number) => void;   // Nova prop para commitar apenas ao sair
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}

const MoneyInput: React.FC<MoneyInputProps> = ({ value, onChange, onBlur, className = '', placeholder = 'R$ 0,00', disabled = false }) => {
    const [displayValue, setDisplayValue] = useState('');

    // Formata o valor numérico para string (PT-BR) ao montar ou receber novo valor EXTERNO
    useEffect(() => {
        // Se o valor for undefined/null, limpa
        if (value === undefined || value === null) {
            setDisplayValue('');
            return;
        }

        // Formata o número para exibição
        const formatted = formatValue(value);
        setDisplayValue(formatted);
    }, [value]);

    const formatValue = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        const digits = inputValue.replace(/\D/g, '');

        // Se estiver vazio
        if (!digits) {
            setDisplayValue('');
            if (onChange) onChange(0);
            return;
        }

        // Calcula o novo valor numérico
        const numberValue = Number(digits) / 100;

        // Atualiza o visual IMEDIATAMENTE (sem esperar o pai)
        // Isso garante a fluidez da digitação (ATM style)
        setDisplayValue(formatValue(numberValue));

        // Propaga se houver onChange configurado (uso normal)
        if (onChange) {
            onChange(numberValue);
        }
    };

    const handleBlur = () => {
        // Ao sair do campo, dispara o evento onBlur com o valor numérico atual
        // Re-calculamos baseados no displayValue atual para garantir consistência
        const digits = displayValue.replace(/\D/g, '');
        const numberValue = digits ? Number(digits) / 100 : 0;

        if (onBlur) {
            onBlur(numberValue);
        }
    };

    return (
        <input
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            onFocus={(e) => e.target.select()}
            onBlur={handleBlur}
            className={className}
            placeholder={placeholder}
            disabled={disabled}
        />
    );
};

export default MoneyInput;
