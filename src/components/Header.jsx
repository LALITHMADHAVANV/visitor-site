import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Header() {
    const navigate = useNavigate();
    const location = useLocation();

    const getPageInfo = () => {
        switch(location.pathname) {
            case '/':
            case '/dashboard':
                return {
                    title: 'Visitor Dashboard',
                    subtitle: 'Real-time gate activity, active visits, and daily stats'
                };
            case '/register':
                return {
                    title: 'New Visitor Registration',
                    subtitle: 'Enter visitor details, capture ID photo, and issue gate pass'
                };
            case '/visitors':
                return {
                    title: 'Visitor History & Logs',
                    subtitle: 'Search historical logs, view past visitor passes, and export reports'
                };
            case '/preregister':
                return {
                    title: 'Pre-Registered Visitors',
                    subtitle: 'Manage expected guest arrivals and pre-approved visits'
                };
            default:
                return {
                    title: 'Visitor Management System',
                    subtitle: 'Esstee Exports Security Portal'
                };
        }
    };

    const { title, subtitle } = getPageInfo();

    return (
        <header className="top-header">
            <div className="header-title-group">
                <h1>{title}</h1>
                <p className="header-subtitle">{subtitle}</p>
            </div>
            <div className="header-actions">
                {location.pathname !== '/register' && (
                    <button 
                        className="btn btn-primary btn-sm-header" 
                        onClick={() => navigate('/register')}
                    >
                        <i className="fa-solid fa-plus"></i>
                        <span>New Visitor</span>
                    </button>
                )}
            </div>
        </header>
    );
}
