import React from 'react';
import ReactDOM from 'react-dom/client';
import AppLayout from './layouts/AppLayout';
import { RoleProvider } from './contexts/RoleContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RoleProvider>
      <AppLayout />
    </RoleProvider>
  </React.StrictMode>
);
