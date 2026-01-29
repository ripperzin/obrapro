
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ReloadPrompt from './components/ReloadPrompt';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import ErrorBoundary from './components/ErrorBoundary';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from './lib/react-query';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Resume mutations after initial restore from localStorage
        // NOTE: Removed invalidateQueries() to prevent aggressive re-renders
        queryClient.resumePausedMutations();
      }}
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </PersistQueryClientProvider>
    <ReloadPrompt />
  </React.StrictMode>
);
