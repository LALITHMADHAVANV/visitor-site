import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { useAuth } from '../AuthContext';
import './Login.css';

export default function Login() {
    const [view, setView] = useState('selection'); // 'selection' or 'login'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        
        try {
            const user = await db.users.get({ username });
            
            if (user && user.password === password) {
                // Remove password from object before storing in state
                const { password: _, ...safeUser } = user;
                login(safeUser);
                
                // Navigate based on role
                if (user.role === 'admin' || user.role === 'security') {
                    navigate('/dashboard');
                } else {
                    navigate('/kiosk');
                }
            } else {
                setError('Invalid username or password');
            }
        } catch (err) {
            console.error("Login Error:", err);
            setError('An error occurred during login');
        }
    };

    return (
        <div className="login-container">
            <div className="login-card glass-panel" style={view === 'selection' ? { maxWidth: '600px' } : {}}>
                <div className="login-header">
                    <i className="fa-solid fa-shield-halved brand-icon" style={{ fontSize: '48px', color: 'var(--accent-primary)', marginBottom: '16px' }}></i>
                    <h2>VMS <span className="highlight">Pro</span></h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                        {view === 'selection' ? 'Select your role to continue' : 'Sign in to continue'}
                    </p>
                </div>
                
                {view === 'selection' ? (
                    <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <div 
                            className="role-selection-card glass-panel" 
                            style={{ flex: 1, minWidth: '200px', cursor: 'pointer', textAlign: 'center', padding: '32px', transition: 'all 0.3s' }}
                            onClick={() => navigate('/kiosk')}
                        >
                            <i className="fa-solid fa-users" style={{ fontSize: '48px', color: 'var(--accent-primary)', marginBottom: '16px' }}></i>
                            <h3>Visitor</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>Check in or register</p>
                        </div>
                        <div 
                            className="role-selection-card glass-panel" 
                            style={{ flex: 1, minWidth: '200px', cursor: 'pointer', textAlign: 'center', padding: '32px', transition: 'all 0.3s' }}
                            onClick={() => setView('login')}
                        >
                            <i className="fa-solid fa-user-tie" style={{ fontSize: '48px', color: 'var(--accent-primary)', marginBottom: '16px' }}></i>
                            <h3>Worker</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>Login to dashboard</p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleLogin} className="login-form">
                        {error && <div className="login-error text-danger" style={{ marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>{error}</div>}
                        
                        <div className="form-group">
                            <label>Username</label>
                            <input 
                                type="text" 
                                required 
                                value={username} 
                                onChange={(e) => setUsername(e.target.value)} 
                                className="form-control"
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input 
                                type="password" 
                                required 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                className="form-control"
                            />
                        </div>
                        
                        <button type="submit" className="btn btn-primary w-100" style={{ marginTop: '16px' }}>
                            Login
                        </button>
                        
                        <div style={{ marginTop: '24px', textAlign: 'center' }}>
                            <button type="button" className="btn btn-outline w-100" onClick={() => setView('selection')}>
                                Back to Selection
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
