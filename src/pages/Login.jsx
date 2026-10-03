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
    const [submitting, setSubmitting] = useState(false);
    
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        
        try {
            const user = await db.users.get({ username });
            
            if (user && user.password === password) {
                const { password: _, ...safeUser } = user;
                login(safeUser);
                
                if (user.role === 'admin' || user.role === 'security') {
                    navigate('/dashboard');
                } else {
                    navigate('/kiosk');
                }
            } else {
                setError('Invalid username or password. Please try again.');
            }
        } catch (err) {
            console.error("Login Error:", err);
            setError('An error occurred during login. Please check console.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-container">
            <div className={`login-card ${view === 'selection' ? 'selection-mode' : ''}`}>
                <div className="login-header">
                    <img src="/company-logo.png" alt="Esstee Exports" className="login-logo" />
                    <h2>Esstee <span className="highlight">Exports</span></h2>
                    <p className="login-subtitle">
                        {view === 'selection' 
                            ? 'Visitor Management & Security Portal' 
                            : 'Sign in to access security & management console'}
                    </p>
                </div>
                
                {view === 'selection' ? (
                    <div className="portal-selection-grid">
                        <div 
                            className="portal-choice-card"
                            onClick={() => navigate('/kiosk')}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="portal-icon-wrapper visitor-icon">
                                <i className="fa-solid fa-id-badge"></i>
                            </div>
                            <h3>Visitor Self-Service</h3>
                            <p>Register your visit, generate digital QR pass, or self check-in</p>
                            <div className="portal-card-btn">
                                <span>Continue as Visitor</span>
                                <i className="fa-solid fa-arrow-right"></i>
                            </div>
                        </div>

                        <div 
                            className="portal-choice-card"
                            onClick={() => setView('login')}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="portal-icon-wrapper staff-icon">
                                <i className="fa-solid fa-shield-halved"></i>
                            </div>
                            <h3>Security & Admin</h3>
                            <p>Sign in with staff credentials to manage visitors and gate passes</p>
                            <div className="portal-card-btn">
                                <span>Staff Sign In</span>
                                <i className="fa-solid fa-arrow-right"></i>
                            </div>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleLogin} className="login-form">
                        {error && (
                            <div className="login-error-alert">
                                <i className="fa-solid fa-circle-exclamation"></i>
                                <span>{error}</span>
                            </div>
                        )}
                        
                        <div className="form-group">
                            <label>Username</label>
                            <input 
                                type="text" 
                                required 
                                value={username} 
                                onChange={(e) => setUsername(e.target.value)} 
                                className="form-control"
                                placeholder="Enter your username"
                                autoFocus
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
                                placeholder="Enter your password"
                            />
                        </div>
                        
                        <button 
                            type="submit" 
                            className="btn btn-primary w-100" 
                            style={{ padding: '11px', marginTop: '8px' }}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <>
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                    <span>Verifying...</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign In to Dashboard</span>
                                    <i className="fa-solid fa-arrow-right"></i>
                                </>
                            )}
                        </button>
                        
                        <div style={{ marginTop: '20px', textAlign: 'center' }}>
                            <button 
                                type="button" 
                                className="btn btn-outline w-100" 
                                onClick={() => setView('selection')}
                            >
                                <i className="fa-solid fa-arrow-left"></i>
                                <span>Back to Portal Selection</span>
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
