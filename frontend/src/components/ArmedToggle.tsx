import { useState, useEffect } from 'react';
import { getArmedStatus, setArmedStatus } from '../api/mt5';

interface ArmedToggleProps {
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  className?: string;
}

export function ArmedToggle({ armed, onArmedChange, className = '' }: ArmedToggleProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load initial armed status
    getArmedStatus().then(onArmedChange).catch(console.error);
  }, [onArmedChange]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const newArmed = !armed;
      await setArmedStatus(newArmed);
      onArmedChange(newArmed);
    } catch (error) {
      console.error('Failed to toggle armed status:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm font-medium text-terminal-text-secondary">
        ARMED
      </span>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${armed ? 'bg-terminal-success' : 'bg-terminal-border'}
          ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-terminal-focus-ring focus:ring-offset-2
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${armed ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  );
}