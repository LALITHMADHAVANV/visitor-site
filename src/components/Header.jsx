import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Header() {
    const navigate = useNavigate();
    const location = useLocation();

    const getTitle = () => {
        switch(location.pathname) {
            case '/': return 'Dashboard';
            case '/register': return 'New Visitor Registration';
            case '/visitors': return 'Visitor History';
            case '/preregister': return 'Pre-Register Visitors';
            default: return 'Visitor Management System';
        }
    };

    return (
        <header className="top-header">
            <h1>{getTitle()}</h1>
            <div className="header-actions">
                <button 
                    className="btn btn-primary" 
                    onClick={() => navigate('/register')}
                >
                    <i className="fa-solid fa-plus"></i> Quick Register
                </button>
            </div>
        </header>
    );
}
