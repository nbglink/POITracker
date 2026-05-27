import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// NOTE: Backend execution is gated by the MT5_EXECUTION_ENABLED env var and must
// be enabled deliberately by the operator. The frontend must NOT flip it — doing
// so would collapse the dual-authorization safety model to a single gate.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);