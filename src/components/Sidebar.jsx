import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './Sidebar.css';

export default function Sidebar() {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <aside className="sidebar glass-panel">
            <div className="brand">
                <img src="/company-logo.png" alt="Esstee Exports Logo" className="brand-logo" />
                <div className="brand-text">
                    <h2>Esstee <span className="highlight">Exports</span></h2>
                    <span className="brand-subtitle">Visitor Management</span>
                </div>
            </div>
            
            {/* User Profile Card */}
            <div className="user-profile-badge">
                <div className="user-avatar-circle">S</div>
                <div className="user-info">
                    <span className="user-name">Security Desk</span>
                    <span className="user-role-tag role-admin">Gate Control</span>
                </div>
            </div>

            <nav className="nav-menu">
                <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-solid fa-chart-pie"></i>
                    <span>Dashboard</span>
                </NavLink>
                <NavLink to="/register" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-solid fa-user-plus"></i>
                    <span>New Visitor</span>
                </NavLink>
                
                <NavLink to="/preregister" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-regular fa-calendar-check"></i>
                    <span>Pre-Register</span>
                </NavLink>

                <NavLink to="/visitors" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                    <i className="fa-solid fa-clock-rotate-left"></i>
                    <span>Visitor History</span>
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <div className="live-clock-card">
                    <div className="time-widget">
                        {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                    </div>
                    <div className="date-widget">
                        {time.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})}
                    </div>
                </div>
            </div>
        </aside>
    );
}
