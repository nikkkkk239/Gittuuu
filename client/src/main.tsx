import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css'; 
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import { FolderProvider } from "./context/FolderContext";
ReactDOM.createRoot(document.getElementById('root')!).render(

    <AuthProvider>
      <FolderProvider>
        <BrowserRouter>
          <App />
          <Toaster/>
        </BrowserRouter>
      </FolderProvider>
    </AuthProvider>

);
