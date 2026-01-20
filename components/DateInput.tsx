import React, { useState, useEffect, useRef } from 'react';

interface DateInputProps {
    value: string | undefined; // Expects YYYY-MM-DD or undefined/empty
    onChange?: (value: string) => void;
    onBlur?: (value: string) => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}

const DateInput: React.FC<DateInputProps> = ({
    value,
    onChange,
    onBlur,
    className = '',
    placeholder = 'DD/MM/AAAA',
    disabled = false
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Helper: YYYY-MM-DD -> DD/MM/YYYY
    const formatDateToDisplay = (isoDate: string | undefined) => {
        if (!isoDate) return '';
        const [year, month, day] = isoDate.split('-');
        if (!year || !month || !day) return isoDate; // Fallback
        return `${day}/${month}/${year}`;
    };

    // Helper: DD/MM/YYYY -> YYYY-MM-DD
    const parseDisplayToIso = (display: string) => {
        const parts = display.split('/');
        if (parts.length !== 3) return '';
        const [day, month, year] = parts;
        if (day.length !== 2 || month.length !== 2 || year.length !== 4) return '';
        return `${year}-${month}-${day}`;
    };

    // Sync internal state with external value
    useEffect(() => {
        setDisplayValue(formatDateToDisplay(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let input = e.target.value;

        // Remove non-digits
        const digits = input.replace(/\D/g, '');

        // Masking logic: DD/MM/YYYY
        let masked = '';
        if (digits.length <= 2) {
            masked = digits;
        } else if (digits.length <= 4) {
            masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        } else {
            masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
        }

        setDisplayValue(masked);

        // If fully filled (10 chars: DD/MM/YYYY), try to propagate change immediately (optional)
        if (masked.length === 10 && onChange) {
            const iso = parseDisplayToIso(masked);
            if (iso) onChange(iso);
        }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        e.target.select();
    };

    const handleBlur = () => {
        const iso = parseDisplayToIso(displayValue);

        // Basic validation: Check valid date
        const isValid = !isNaN(Date.parse(iso));

        if (isValid) {
            if (onBlur) onBlur(iso);
            if (onChange) onChange(iso); // Sync ensures parent has latest correct value
        } else {
            // If invalid, revert to original value or clear if it was empty
            if (displayValue === '') {
                if (onBlur) onBlur('');
                if (onChange) onChange('');
            } else {
                // Reset to previous valid value form prop
                setDisplayValue(formatDateToDisplay(value));
            }
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={className}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={10}
        />
    );
};

export default DateInput;
