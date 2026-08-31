import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db';
import './Scanner.css'; // Reuse scanner styles

export default function MobileAction() {
    const [searchParams] = useSearchParams();
    const visitorId = searchParams.get('id');
    const [visitor, setVisitor] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready, success, error

    useEffect(() => {
        if (!visitorId) {
            setStatus('error');
            return;
        }

        const fetchVisitor = async () => {
            try {
                const v = await db.visitors.get(visitorId);
                if (v) {
                    setVisitor(v);
                    setStatus('ready');
                } else {
                    setStatus('error');
                }
            } catch (err) {
                console.error(err);
                setStatus('error');
            }
        };

        fetchVisitor();
    }, [visitorId]);

    const handleAction = async () => {
        if (!visitor) return;
        
        try {
            if (visitor.status === 'registered' || visitor.status === 'expected') {
                await db.visitors.update(visitor.id, {
                    status: 'checked-in',
                    checkInTime: new Date().toISOString()
                });
                setStatus('success-in');
            } else if (visitor.status === 'checked-in') {
                await db.visitors.update(visitor.id, {
                    status: 'checked-out',
                    checkOutTime: new Date().toISOString()
                });
                setStatus('success-out');
            } else {
                setStatus('error-expired');
            }
        } catch (err) {
            setStatus('error');
        }
    };

    if (status === 'loading') return <div style={{padding: '32px', textAlign: 'center', color: 'white'}}>Loading...</div>;
    if (status === 'error') return <div style={{padding: '32px', textAlign: 'center', color: 'var(--danger)'}}><h2>Invalid QR Code</h2></div>;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                <i className="fa-solid fa-shield-halved" style={{ fontSize: '48px', color: 'var(--accent-primary)', marginBottom: '16px' }}></i>
                <h2>VMS <span className="highlight">Pro</span></h2>
                
                {status === 'ready' && (
                    <div style={{ marginTop: '32px' }}>
                        <h3 style={{ color: 'white', marginBottom: '8px' }}>{visitor.name}</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>ID: {visitor.id}</p>
                        
                        <button 
                            className="btn btn-primary w-100" 
                            style={{ padding: '16px', fontSize: '18px' }}
                            onClick={handleAction}
                        >
                            {visitor.status === 'checked-in' ? 'Check Out Now' : 'Check In Now'}
                        </button>
                    </div>
                )}

                {status === 'success-in' && (
                    <div style={{ marginTop: '32px' }}>
                        <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--success)' }}>Checked In Successfully!</h3>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Welcome to the building.</p>
                    </div>
                )}

                {status === 'success-out' && (
                    <div style={{ marginTop: '32px' }}>
                        <i className="fa-solid fa-person-walking-arrow-right text-primary" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--accent-primary)' }}>Checked Out Successfully!</h3>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Have a great day.</p>
                    </div>
                )}

                {status === 'error-expired' && (
                    <div style={{ marginTop: '32px' }}>
                        <i className="fa-solid fa-circle-xmark text-danger" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--danger)' }}>Pass Expired</h3>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>This pass has already been used.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
