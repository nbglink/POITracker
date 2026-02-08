import React from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ className, label, error, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium text-[hsl(var(--foreground))]">
          {label}
        </label>
      )}
      <input
        className={cn(
          'flex h-10 w-full rounded-sm border bg-[hsl(var(--input-bg))] px-3 py-2 text-sm font-mono tabular-nums',
          'border-[hsl(var(--input-border))] placeholder:text-[hsl(var(--text-faint))]',
          'focus-visible:border-[hsl(var(--focus-ring))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--focus-ring))]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}