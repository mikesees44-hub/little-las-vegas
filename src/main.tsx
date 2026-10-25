import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { Guard } from './ui/components/Guard';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Guard label="The game" onReset={() => location.reload()}>
      <App />
    </Guard>
  </React.StrictMode>,
);
