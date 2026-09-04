import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Visitors from './pages/Visitors';
import PreRegister from './pages/PreRegister';
import Login from './pages/Login';
import Scanner from './pages/Scanner';
import MobileAction from './pages/MobileAction';
import { AuthProvider, useAuth } from './AuthContext';
import { seedUsers } from './db';
import './index.css';

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div>Loading...</div>;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Layout for authenticated users
const AuthenticatedLayout = ({ children }) => {
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
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/mobile-action" element={<MobileAction />} />
      <Route path="/kiosk" element={
        <div className="app-container" style={{ display: 'block', overflowY: 'auto' }}>
          <header style={{ padding: '24px', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>
            <h1 style={{ color: 'var(--accent-primary)' }}>Welcome to VMS Pro</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Please register below</p>
          </header>
          <div style={{ padding: '32px' }}>
             <Register isKiosk={true} />
          </div>
        </div>
      } />

      {/* Protected Routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['admin', 'security']}>
          <AuthenticatedLayout>
            <Dashboard />
          </AuthenticatedLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/register" element={
        <ProtectedRoute allowedRoles={['admin', 'security']}>
          <AuthenticatedLayout>
            <Register />
          </AuthenticatedLayout>
        </ProtectedRoute>
      } />

      <Route path="/visitors" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AuthenticatedLayout>
            <Visitors />
          </AuthenticatedLayout>
        </ProtectedRoute>
      } />

      <Route path="/preregister" element={
        <ProtectedRoute allowedRoles={['admin', 'security']}>
          <AuthenticatedLayout>
            <PreRegister />
          </AuthenticatedLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/scanner" element={
        <ProtectedRoute allowedRoles={['admin', 'security']}>
          <AuthenticatedLayout>
            <Scanner />
          </AuthenticatedLayout>
        </ProtectedRoute>
      } />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
