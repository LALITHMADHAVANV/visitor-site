import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db';
import { sendTelegramMessage } from '../telegram';
import './Scanner.css'; // Reuse scanner styles

export default function MobileAction() {
    const [searchParams] = useSearchParams();
    const visitorId = searchParams.get('id');
    
    const [visitor, setVisitor] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready-checkin, ready-checkout, success-in, success-out, error
    
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!visitorId) {
            setStatus('error');
            return;
        }

        const fetchVisitorInfo = async () => {
            try {
                const v = await db.visitors.get(visitorId);
                if (!v) {
                    setStatus('error');
                    return;
                }
                setVisitor(v);

                if (v.status === 'registered' || v.status === 'expected') {
                    setStatus('ready-checkin');
                } else if (v.status === 'checked-in') {
                    setStatus('ready-checkout');
                } else if (v.status === 'checked-out') {
                    setStatus('success-out');
                } else {
                    setStatus('error');
                }
            } catch (err) {
                console.error("MobileAction Fetch Error:", err);
                setStatus('error');
            }
        };

        fetchVisitorInfo();
    }, [visitorId]);

    const handleConfirmCheckIn = async () => {
        if (!visitor) return;
        setProcessing(true);
        try {
            // Generate 4-digit PIN for Host
            const pin = Math.floor(1000 + Math.random() * 9000).toString();
            
            await db.visitors.update(visitor.id, {
                status: 'checked-in',
                checkInTime: new Date().toISOString(),
                auth_pin: pin
            });

            // Send Telegram message to Host
            await sendTelegramMessage(visitor.name, visitor.hostName, pin);
            
            setVisitor(prev => ({ ...prev, status: 'checked-in', auth_pin: pin }));
            setStatus('success-in');
        } catch (err) {
            console.error("Check-in error:", err);
            setStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirmCheckOut = async (e) => {
        e.preventDefault();
        setPinError('');
        
        if (!enteredPin) {
            setPinError('Please enter the 4-digit PIN from the host.');
            return;
        }

        setProcessing(true);
        try {
            const v = await db.visitors.get(visitorId);
            
            if (v && v.auth_pin === enteredPin) {
                // PIN verified! Complete check-out
                await db.visitors.update(visitorId, {
                    status: 'checked-out',
                    checkOutTime: new Date().toISOString(),
                    auth_pin: null
                });
                setStatus('success-out');
            } else {
                setPinError('Invalid PIN. Please enter the 4-digit PIN sent to the host.');
            }
        } catch (error) {
            console.error("Check-out verification error:", error);
            setPinError('Error completing check-out.');
        } finally {
            setProcessing(false);
        }
    };

    if (status === 'loading') return <div style={{padding: '32px', textAlign: 'center', color: 'white'}}>Loading Visitor Info...</div>;
    if (status === 'error') return <div style={{padding: '32px', textAlign: 'center', color: 'var(--danger)'}}><h2>Invalid or Pass Expired</h2></div>;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '32px', textAlign: 'center' }}>
                <i className="fa-solid fa-id-card" style={{ fontSize: '48px', color: 'var(--accent-primary)', marginBottom: '16px' }}></i>
                <h2 style={{ marginBottom: '4px' }}>Visitor Pass</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>Visitor Management Portal</p>
                
                {/* Visitor Info Card */}
                {visitor && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left' }}>
                        <p style={{ margin: '4px 0', color: 'white' }}><strong>Visitor:</strong> {visitor.name}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}><strong>Host:</strong> {visitor.hostName}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}><strong>Purpose:</strong> {visitor.purpose}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)', fontFamily: 'monospace' }}><strong>ID:</strong> {visitor.id}</p>
                    </div>
                )}

                {/* State 1: Ready to Check In */}
                {status === 'ready-checkin' && (
                    <div>
                        <button 
                            className="btn btn-primary w-100" 
                            style={{ padding: '16px', fontSize: '18px' }}
                            onClick={handleConfirmCheckIn}
                            disabled={processing}
                        >
                            {processing ? 'Processing...' : 'Confirm Check In'}
                        </button>
                    </div>
                )}

                {/* State 2: Just Checked In */}
                {status === 'success-in' && (
                    <div>
                        <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--success)', marginBottom: '8px' }}>Checked In Successfully!</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                            A 4-digit PIN has been dispatched to <strong>{visitor?.hostName}</strong> via Telegram.
                        </p>
                        <button className="btn btn-outline w-100" onClick={() => setStatus('ready-checkout')}>
                            Proceed to Check-Out Verification
                        </button>
                    </div>
                )}

                {/* State 3: Ready to Check Out (Requires Host PIN) */}
                {status === 'ready-checkout' && (
                    <div>
                        <h3 style={{ color: 'white', marginBottom: '8px' }}>Check Out</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                            Enter the 4-digit PIN provided by your host (<strong>{visitor?.hostName}</strong>) to check out:
                        </p>

                        <form onSubmit={handleConfirmCheckOut}>
                            {pinError && <div className="text-danger" style={{ marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', fontSize: '14px' }}>{pinError}</div>}
                            
                            <div className="form-group" style={{ marginBottom: '20px' }}>
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

                            <button type="submit" className="btn btn-primary w-100" style={{ padding: '14px', fontSize: '16px' }} disabled={processing}>
                                {processing ? 'Verifying...' : 'Verify PIN & Check Out'}
                            </button>
                        </form>
                    </div>
                )}

                {/* State 4: Checked Out */}
                {status === 'success-out' && (
                    <div>
                        <i className="fa-solid fa-person-walking-arrow-right text-primary" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--accent-primary)', marginBottom: '8px' }}>Visitor Checked Out</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>This pass is completed and closed.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
