import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './Sidebar.css';

export default function Sidebar() {
    const [time, setTime] = useState(new Date());
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <aside className="sidebar glass-panel">
            <div className="brand">
                <i className="fa-solid fa-shield-halved brand-icon"></i>
                <h2>VMS <span className="highlight">Pro</span></h2>
            </div>
            
            <div style={{ padding: '0 24px', marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Logged in as: <strong style={{color: 'white', textTransform: 'capitalize'}}>{user?.username} ({user?.role})</strong></span>
            </div>

            <nav className="nav-menu">
                <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-solid fa-chart-pie"></i> Dashboard
                </NavLink>
                <NavLink to="/register" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-solid fa-user-plus"></i> New Visitor
                </NavLink>
                
                {user?.role === 'admin' && (
                    <NavLink to="/visitors" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                        <i className="fa-solid fa-users"></i> Visitor History
                    </NavLink>
                )}
                
                <NavLink to="/preregister" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-regular fa-calendar-check"></i> Pre-Register
                </NavLink>
            </nav>
            <div className="sidebar-footer">
                <button className="btn btn-outline w-100" onClick={handleLogout} style={{ marginBottom: '24px' }}>
                    <i className="fa-solid fa-sign-out-alt"></i> Logout
                </button>
                <div className="time-widget">
                    {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
                <div className="date-widget">
                    {time.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'})}
                </div>
            </div>
        </aside>
    );
}
