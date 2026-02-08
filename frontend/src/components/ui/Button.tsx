import React from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))] focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--background))]',
        'disabled:opacity-50 disabled:pointer-events-none',
        {
          // Variants
          'bg-[hsl(var(--primary))] text-black hover:bg-[hsl(var(--primary-hover))]':
            variant === 'primary',
          'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border border-[hsl(var(--card-border))] hover:bg-[hsl(var(--card-hover))]':
            variant === 'secondary',
          'border border-[hsl(var(--card-border))] bg-transparent hover:bg-[hsl(var(--card))]':
            variant === 'outline',
          'bg-transparent hover:bg-[hsl(var(--card))]':
            variant === 'ghost',
        },
        {
          // Sizes
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
}