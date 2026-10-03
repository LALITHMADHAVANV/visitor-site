import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

// Default user — no login required
const DEFAULT_USER = {
    username: 'Security',
    role: 'admin',
    id: 'default-user'
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(DEFAULT_USER);
    const [loading, setLoading] = useState(false);

    const login = (userData) => {
        setUser(userData || DEFAULT_USER);
    };

    const logout = () => {
        // Just reset to default user — no actual sign-out needed
        setUser(DEFAULT_USER);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
