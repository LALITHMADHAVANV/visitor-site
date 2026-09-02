import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db';
import { sendTelegramMessage } from '../telegram';
import './Scanner.css'; // Reuse scanner styles

export default function MobileAction() {
    const [searchParams] = useSearchParams();
    const visitorId = searchParams.get('id');
    const [visitor, setVisitor] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready, waiting-for-checkout-pin, success, error
    
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');

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

    const handleCheckIn = async () => {
        if (!visitor) return;
        try {
            await db.visitors.update(visitor.id, {
                status: 'checked-in',
                checkInTime: new Date().toISOString()
            });
            setStatus('success-in');
        } catch (err) {
            setStatus('error');
        }
    };

    const handleCheckOutRequest = async () => {
        if (!visitor) return;
        try {
            // Generate PIN
            const pin = Math.floor(1000 + Math.random() * 9000).toString();
            
            await db.visitors.update(visitor.id, {
                auth_pin: pin
            });
            
            // Send telegram message
            await sendTelegramMessage(visitor.name, visitor.hostName, pin);
            
            setStatus('waiting-for-checkout-pin');
        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    const handlePinVerification = async (e) => {
        e.preventDefault();
        setPinError('');
        
        try {
            const v = await db.visitors.get(visitorId);
            
            if (v && v.auth_pin === enteredPin) {
                // PIN matches, process checkout
                await db.visitors.update(visitor.id, {
                    status: 'checked-out',
                    checkOutTime: new Date().toISOString(),
                    auth_pin: null
                });
                setStatus('success-out');
            } else {
                setPinError('Invalid PIN. Please ask your host for the correct 4-digit code.');
            }
        } catch (error) {
            console.error("PIN Verification Error:", error);
            setPinError('Error verifying PIN.');
        }
    };

    if (status === 'loading') return <div style={{padding: '32px', textAlign: 'center', color: 'white'}}>Loading...</div>;
    if (status === 'error') return <div style={{padding: '32px', textAlign: 'center', color: 'var(--danger)'}}><h2>Invalid QR Code</h2></div>;

    if (status === 'waiting-for-checkout-pin') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                    <i className="fa-brands fa-telegram text-primary" style={{ fontSize: '64px', marginBottom: '24px' }}></i>
                    <h2>Checkout Approval Required</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', marginTop: '16px' }}>
                        We have notified <strong>{visitor.hostName}</strong> that you are leaving. Please ask them for the 4-digit PIN to check out.
                    </p>
                    
                    <form onSubmit={handlePinVerification}>
                        {pinError && <div className="text-danger" style={{ marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px' }}>{pinError}</div>}
                        
                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <input 
                                type="text" 
                                required 
                                value={enteredPin}
                                onChange={(e) => setEnteredPin(e.target.value)}
                                placeholder="Enter 4-digit PIN"
                                style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '8px', width: '100%' }}
                                maxLength={4}
                                className="form-control"
                            />
                        </div>

                        <button type="submit" className="btn btn-primary w-100" style={{ padding: '16px', fontSize: '18px' }}>
                            Verify & Check Out
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                <i className="fa-solid fa-shield-halved" style={{ fontSize: '48px', color: 'var(--accent-primary)', marginBottom: '16px' }}></i>
                <h2>VMS <span className="highlight">Pro</span></h2>
                
                {status === 'ready' && (
                    <div style={{ marginTop: '32px' }}>
                        <h3 style={{ color: 'white', marginBottom: '8px' }}>{visitor.name}</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>ID: {visitor.id}</p>
                        
                        {visitor.status === 'registered' || visitor.status === 'expected' ? (
                            <button 
                                className="btn btn-primary w-100" 
                                style={{ padding: '16px', fontSize: '18px' }}
                                onClick={handleCheckIn}
                            >
                                Check In Now
                            </button>
                        ) : visitor.status === 'checked-in' ? (
                            <button 
                                className="btn btn-primary w-100" 
                                style={{ padding: '16px', fontSize: '18px' }}
                                onClick={handleCheckOutRequest}
                            >
                                Check Out Now
                            </button>
                        ) : (
                            <div style={{ marginTop: '32px' }}>
                                <i className="fa-solid fa-circle-xmark text-danger" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                                <h3 style={{ color: 'var(--danger)' }}>Pass Expired</h3>
                                <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>This pass has already been used.</p>
                            </div>
                        )}
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
            </div>
        </div>
    );
}
