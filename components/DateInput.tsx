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

    // Helper: DD/MM/YYYY -> YYYY-MM-DD (Robust)
    const parseDisplayToIso = (display: string) => {
        let clean = display.replace(/\D/g, '');
        if (!clean) return '';

        // Pads logic: treat d/m/yyyy, dd/m/yyyy etc
        const parts = display.split('/');
        if (parts.length !== 3) return '';

        let [day, month, year] = parts;

        if (!day || !month || !year) return '';

        day = day.padStart(2, '0');
        month = month.padStart(2, '0');

        if (year.length === 2) year = `20${year}`; // Lazy year handling

        if (day.length !== 2 || month.length !== 2 || year.length !== 4) return '';

        return `${year}-${month}-${day}`;
    };

    // Strict validation (No Date.parse quirks)
    const isValidDate = (iso: string) => {
        if (!iso) return false;
        const [yStr, mStr, dStr] = iso.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const d = parseInt(dStr, 10);

        if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
        if (m < 1 || m > 12) return false;
        if (d < 1 || d > 31) return false;

        // Simple check for day in month validity
        const dateObj = new Date(y, m - 1, d);
        if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) {
            return false;
        }

        return true;
    };

    // Sync internal state with external value
    useEffect(() => {
        setDisplayValue(formatDateToDisplay(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let input = e.target.value;

        // Allow user to clear completely
        if (!input) {
            setDisplayValue('');
            return;
        }

        // Remove non-digits
        // Only digits logic for masking
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
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        e.target.select();
    };

    const handleBlur = () => {
        if (!displayValue) {
            if (onBlur) onBlur('');
            if (onChange) onChange('');
            return;
        }

        const iso = parseDisplayToIso(displayValue);

        if (isValidDate(iso)) {
            if (onBlur) onBlur(iso);
            if (onChange) onChange(iso);
            // Re-format display to appear perfect
            setDisplayValue(formatDateToDisplay(iso));
        } else {
            // Revert to original value if invalid
            setDisplayValue(formatDateToDisplay(value));
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
