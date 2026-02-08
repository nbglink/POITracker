import { useEffect, useRef, useState } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    // Single 3s timer — no deps that can reset it
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onCloseRef.current(), 300);
    }, duration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only — key prop handles re-mounting

  const lines = message.split('\n');
  const isMultiLine = lines.length > 1;

  return (
    <div
      className={`
        fixed bottom-6 left-6 z-50 max-w-sm w-full
        ${type === 'success'
          ? 'border border-green-500/50 bg-green-500/10 backdrop-blur-sm'
          : 'border border-red-500/50 bg-red-500/10 backdrop-blur-sm'}
        px-4 py-3 rounded-lg shadow-lg cursor-pointer
        transition-all duration-300
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      onClick={onClose}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className={`text-lg leading-none mt-0.5 ${type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {type === 'success' ? '✓' : '✕'}
        </span>
        <div className="flex-1 min-w-0">
          {isMultiLine ? (
            lines.map((line, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? 'text-sm font-medium text-terminal-text'
                    : 'text-xs text-terminal-text-secondary mt-0.5'
                }
              >
                {line}
              </p>
            ))
          ) : (
            <p className="text-sm font-medium text-terminal-text">{message}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-2 text-terminal-text-secondary hover:text-terminal-text focus:outline-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}