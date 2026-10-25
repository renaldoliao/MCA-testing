import { createRoot } from 'react-dom/client';

import App from './App';
import StaffAccess, { StaffProvider } from './StaffAccess';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import './motion.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <StaffProvider>{/^\/(sign-in|sign-up|staff-sign-out)(\/|$)/.test(window.location.pathname) ? <StaffAccess /> : <App />}</StaffProvider>
  </ErrorBoundary>,
);
