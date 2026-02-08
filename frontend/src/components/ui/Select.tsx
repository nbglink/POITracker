import React from 'react';
import { cn } from '../../utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  placeholder?: string;
  options: { value: string; label: string }[];
}

export function Select({ className, label, error, placeholder, options, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium text-[hsl(var(--foreground))]">
          {label}
        </label>
      )}
      <select
        className={cn(
          'flex h-10 w-full rounded-lg border bg-[hsl(var(--input-bg))] px-3 py-2 text-sm',
          'border-[hsl(var(--input-border))] focus-visible:border-[hsl(var(--input-focus))]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--input-focus))]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}