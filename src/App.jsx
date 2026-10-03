import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Visitors from './pages/Visitors';
import PreRegister from './pages/PreRegister';
import HardwareScannerListener from './components/HardwareScannerListener';
import MobileAction from './pages/MobileAction';
import { AuthProvider } from './AuthContext';
import { seedUsers } from './db';
import './index.css';

// Layout with Sidebar & Header
const AppLayout = ({ children }) => {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Header />
        <div className="views-container">
          {children}
        </div>
      </main>
    </div>
  );
};

// Main App Component
function AppContent() {
  useEffect(() => {
    seedUsers();
  }, []);

  return (
    <>
      <HardwareScannerListener />
      <Routes>
        {/* Public Routes */}
        <Route path="/mobile-action" element={<MobileAction />} />
        <Route path="/kiosk" element={
        <div className="kiosk-page-wrapper">
          <header className="kiosk-header">
            <div className="kiosk-header-brand">
              <img src="/company-logo.png" alt="Esstee Exports" className="kiosk-header-logo" />
              <div className="kiosk-header-text">
                <h1 className="kiosk-header-title">Esstee Exports</h1>
                <span className="kiosk-header-subtitle">Visitor Self-Service Kiosk</span>
              </div>
            </div>
          </header>
          <main className="kiosk-main-body">
            <Register isKiosk={true} />
          </main>
        </div>
      } />

        {/* All Staff Routes — No Authentication Required */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        <Route path="/dashboard" element={
          <AppLayout>
            <Dashboard />
          </AppLayout>
        } />
        
        <Route path="/register" element={
          <AppLayout>
            <Register />
          </AppLayout>
        } />

        <Route path="/visitors" element={
          <AppLayout>
            <Visitors />
          </AppLayout>
        } />

        <Route path="/preregister" element={
          <AppLayout>
            <PreRegister />
          </AppLayout>
        } />
        
        <Route path="/scanner" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
