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
        <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column' }}>
          <header style={{ 
            background: '#ffffff', 
            padding: '14px 28px', 
            borderBottom: '1px solid var(--border-color)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/company-logo.png" alt="Esstee Exports" style={{ height: '34px', objectFit: 'contain' }} />
              <div>
                <h1 style={{ fontSize: '17px', margin: 0, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Esstee Exports</h1>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Visitor Self-Service Kiosk</span>
              </div>
            </div>
            <a href="/" className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}>
              <i className="fa-solid fa-arrow-left"></i> Staff Portal
            </a>
          </header>
          <main style={{ flex: 1, padding: '28px 20px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
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
