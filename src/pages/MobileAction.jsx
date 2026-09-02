import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../db';
import { sendTelegramMessage } from '../telegram';
import './Scanner.css'; // Reuse scanner styles

export default function MobileAction() {
    const [searchParams] = useSearchParams();
    const visitorId = searchParams.get('id');
    const actionParam = searchParams.get('action');
    
    const [visitor, setVisitor] = useState(null);
    // Statuses: loading, enter-pin, show-exit-qr, security-exit-success, security-exit-invalid, error
    const [status, setStatus] = useState('loading');
    
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [processing, setProcessing] = useState(false);
    const [checkoutTimeDisplay, setCheckoutTimeDisplay] = useState('');

    const statusRef = useRef(status);
    statusRef.current = status;

    const getCleanOrigin = () => {
        const origin = window.location.origin;
        if (origin.includes('.vercel.app') && origin.includes('-')) {
            return 'https://visitor-site-seven.vercel.app';
        }
        return origin;
    };

    useEffect(() => {
        if (!visitorId) {
            setStatus('error');
            return;
        }

        const handleFlow = async () => {
            try {
                const v = await db.visitors.get(visitorId);
                if (!v) {
                    if (statusRef.current !== 'error') setStatus('error');
                    return;
                }
                setVisitor(v);

                // --- 1. SECURITY EXIT SCAN (action=checkout) ---
                if (actionParam === 'checkout') {
                    if (v.status === 'checked-out') {
                        // Re-scanning used pass -> Invalid/Already Used
                        if (statusRef.current !== 'security-exit-invalid') {
                            setStatus('security-exit-invalid');
                        }
                    } else if (v.status === 'checked-in') {
                        // Valid exit scan by Security
                        const now = new Date();
                        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        
                        await db.visitors.update(v.id, {
                            status: 'checked-out',
                            checkOutTime: now.toISOString(),
                            auth_pin: null
                        });
                        
                        setCheckoutTimeDisplay(timeString);
                        if (statusRef.current !== 'security-exit-success') {
                            setStatus('security-exit-success');
                        }
                    } else {
                        if (statusRef.current !== 'security-exit-invalid') {
                            setStatus('security-exit-invalid');
                        }
                    }
                    return;
                }

                // --- 2. VISITOR CHECK-IN SCAN (action=checkin or default) ---
                if (v.status === 'registered' || v.status === 'expected') {
                    // Auto Check-In Immediately
                    let pin = v.auth_pin;
                    if (!pin) {
                        pin = Math.floor(1000 + Math.random() * 9000).toString();
                        await db.visitors.update(v.id, {
                            status: 'checked-in',
                            checkInTime: new Date().toISOString(),
                            auth_pin: pin
                        });
                        // Send Telegram PIN to Host (only once)
                        await sendTelegramMessage(v.name, v.hostName, pin);
                    }
                    
                    v.status = 'checked-in';
                    v.auth_pin = pin;
                    setVisitor(v);
                    
                    if (statusRef.current !== 'show-exit-qr' && statusRef.current !== 'enter-pin') {
                        setStatus('enter-pin');
                    }
                } else if (v.status === 'checked-in') {
                    if (statusRef.current !== 'show-exit-qr' && statusRef.current !== 'enter-pin') {
                        setStatus('enter-pin');
                    }
                } else if (v.status === 'checked-out') {
                    if (statusRef.current !== 'security-exit-invalid') {
                        setStatus('security-exit-invalid');
                    }
                }
            } catch (err) {
                console.error("MobileAction Error:", err);
                if (statusRef.current !== 'error') setStatus('error');
            }
        };

        handleFlow();

        const interval = setInterval(handleFlow, 1000);
        return () => clearInterval(interval);
    }, [visitorId, actionParam]);

    // Visitor PIN Verification Action
    const handlePinVerification = async (e) => {
        e.preventDefault();
        setPinError('');
        
        const cleanPin = enteredPin.trim();

        if (cleanPin.length !== 4) {
            setPinError('Please enter a 4-digit numeric PIN.');
            return;
        }

        setProcessing(true);
        try {
            const v = await db.visitors.get(visitorId);
            
            if (v && v.auth_pin === cleanPin) {
                // Correct PIN -> Unlock Exit Pass
                setStatus('show-exit-qr');
            } else {
                setPinError('Invalid PIN. Please enter the 4-digit code sent to your host.');
            }
        } catch (error) {
            console.error("PIN Verification Error:", error);
            setPinError('Error verifying PIN.');
        } finally {
            setProcessing(false);
        }
    };

    if (status === 'loading') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)', color: 'white' }}>
                Loading...
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                    <i className="fa-solid fa-triangle-exclamation text-danger" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                    <h2 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Invalid QR Token</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>This pass link is invalid or expired.</p>
                </div>
            </div>
        );
    }

    // --- SECURITY SCREEN: INVALID EXIT PASS ---
    if (status === 'security-exit-invalid') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                    <i className="fa-solid fa-circle-xmark text-danger" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                    <h2 style={{ color: 'var(--danger)', marginBottom: '8px' }}>INVALID EXIT PASS</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>
                        This exit pass has already been used or is not authorized.
                    </p>
                </div>
            </div>
        );
    }

    // --- SECURITY SCREEN: EXIT VERIFIED ---
    if (status === 'security-exit-success') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center', border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                    <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                    <h2 style={{ color: 'var(--success)', marginBottom: '8px' }}>EXIT VERIFIED</h2>
                    
                    <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', margin: '20px 0', textAlign: 'left' }}>
                        <p style={{ margin: '4px 0', color: 'white' }}><strong>Visitor:</strong> {visitor?.name}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}><strong>Host:</strong> {visitor?.hostName}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}><strong>Checkout Time:</strong> {checkoutTimeDisplay || 'Just now'}</p>
                        <p style={{ margin: '8px 0 0 0', color: 'var(--success)', fontWeight: 'bold' }}>Status: Checked Out Successfully</p>
                    </div>
                </div>
            </div>
        );
    }

    // --- VISITOR SCREEN: SCREEN 1 & 2 (AUTO CHECK-IN & PIN ENTRY) ---
    if (status === 'enter-pin') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                    {/* Screen 1 Indicator */}
                    <div style={{ marginBottom: '24px', background: 'rgba(34, 197, 94, 0.1)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                        <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px' }}></i>
                        <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '16px' }}>Check-In Successful ✓</span>
                    </div>

                    {/* Screen 2: PIN Entry */}
                    <h2 style={{ color: 'white', marginBottom: '8px' }}>Unlock Exit Pass</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                        Enter the 4-digit PIN sent to your host
                    </p>

                    <form onSubmit={handlePinVerification}>
                        {pinError && (
                            <div className="text-danger" style={{ marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', fontSize: '14px' }}>
                                {pinError}
                            </div>
                        )}
                        
                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <input 
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                required 
                                value={enteredPin}
                                onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="· · · ·"
                                style={{ fontSize: '32px', textAlign: 'center', letterSpacing: '12px', width: '100%', padding: '12px' }}
                                maxLength={4}
                                className="form-control"
                                autoFocus
                            />
                        </div>

                        <button type="submit" className="btn btn-primary w-100" style={{ padding: '16px', fontSize: '16px' }} disabled={processing}>
                            {processing ? 'Validating...' : 'Unlock Exit Pass'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // --- VISITOR SCREEN: SCREEN 3 (EXIT PASS UNLOCKED) ---
    if (status === 'show-exit-qr') {
        const cleanOrigin = getCleanOrigin();
        const exitQrUrl = `${cleanOrigin}/mobile-action?id=${visitorId}&action=checkout`;

        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '10px 16px', borderRadius: '20px', display: 'inline-block', marginBottom: '20px' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '14px' }}>Exit Pass Unlocked ✓</span>
                    </div>

                    <h2 style={{ color: 'white', marginBottom: '4px' }}>EXIT PASS</h2>
                    
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                        <p style={{ margin: '2px 0' }}>Visitor: <strong>{visitor?.name}</strong></p>
                        <p style={{ margin: '2px 0' }}>Host: <strong>{visitor?.hostName}</strong></p>
                        <p style={{ margin: '2px 0', color: 'var(--success)' }}>Status: <strong>Exit Pass Unlocked</strong></p>
                    </div>

                    <div style={{ background: 'white', padding: '20px', display: 'inline-block', borderRadius: '16px', marginBottom: '20px' }}>
                        <QRCodeSVG value={exitQrUrl} size={220} />
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>
                        Show this QR code to Security when leaving the building.
                    </p>
                </div>
            </div>
        );
    }

    return null;
}
