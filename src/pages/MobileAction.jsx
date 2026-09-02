import React, { useState, useEffect } from 'react';
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
    const [status, setStatus] = useState('loading'); // loading, enter-pin, show-checkout-qr, success-out, error
    
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');

    useEffect(() => {
        if (!visitorId) {
            setStatus('error');
            return;
        }

        const handleFlow = async () => {
            try {
                let v = await db.visitors.get(visitorId);
                if (!v) {
                    setStatus('error');
                    return;
                }
                setVisitor(v);

                // Handling explicit Checkout QR scan
                if (actionParam === 'checkout') {
                    if (v.status === 'checked-out') {
                        setStatus('success-out');
                    } else {
                        await db.visitors.update(v.id, {
                            status: 'checked-out',
                            checkOutTime: new Date().toISOString(),
                            auth_pin: null
                        });
                        setStatus('success-out');
                    }
                    return;
                }

                // Handling Check-In QR scan
                if (v.status === 'registered' || v.status === 'expected') {
                    // Generate PIN for host
                    const pin = Math.floor(1000 + Math.random() * 9000).toString();
                    
                    // Mark as checked-in & set auth_pin
                    await db.visitors.update(v.id, {
                        status: 'checked-in',
                        checkInTime: new Date().toISOString(),
                        auth_pin: pin
                    });

                    // Send Telegram notification
                    await sendTelegramMessage(v.name, v.hostName, pin);
                    
                    v.status = 'checked-in';
                    v.auth_pin = pin;
                    setVisitor(v);
                    setStatus('enter-pin');
                } else if (v.status === 'checked-in') {
                    // Already checked in, prompt for host PIN
                    if (!v.auth_pin) {
                        const pin = Math.floor(1000 + Math.random() * 9000).toString();
                        await db.visitors.update(v.id, { auth_pin: pin });
                        await sendTelegramMessage(v.name, v.hostName, pin);
                        v.auth_pin = pin;
                        setVisitor(v);
                    }
                    setStatus('enter-pin');
                } else if (v.status === 'checked-out') {
                    setStatus('success-out');
                } else {
                    setStatus('error');
                }

            } catch (err) {
                console.error("MobileAction Error:", err);
                setStatus('error');
            }
        };

        handleFlow();
    }, [visitorId, actionParam]);

    const handlePinVerification = async (e) => {
        e.preventDefault();
        setPinError('');
        
        try {
            const v = await db.visitors.get(visitorId);
            
            if (v && v.auth_pin === enteredPin) {
                // PIN verified! Show Check-Out QR Code
                setStatus('show-checkout-qr');
            } else {
                setPinError('Invalid PIN. Please ask your host for the 4-digit code sent to their Telegram.');
            }
        } catch (error) {
            console.error("PIN Verification Error:", error);
            setPinError('Error verifying PIN.');
        }
    };

    if (status === 'loading') return <div style={{padding: '32px', textAlign: 'center', color: 'white'}}>Loading...</div>;
    if (status === 'error') return <div style={{padding: '32px', textAlign: 'center', color: 'var(--danger)'}}><h2>Invalid or Expired QR Code</h2></div>;

    if (status === 'enter-pin') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                    <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                    <h2 style={{ color: 'var(--success)', marginBottom: '8px' }}>Checked In!</h2>
                    
                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
                        <i className="fa-brands fa-telegram text-primary" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'white' }}>Host PIN Required</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px', marginBottom: '24px' }}>
                            We have sent a 4-digit PIN to <strong>{visitor?.hostName}</strong> via Telegram. Enter it below to unlock your <strong>Check-Out QR Code</strong>.
                        </p>
                        
                        <form onSubmit={handlePinVerification}>
                            {pinError && <div className="text-danger" style={{ marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', fontSize: '14px' }}>{pinError}</div>}
                            
                            <div className="form-group" style={{ marginBottom: '24px' }}>
                                <input 
                                    type="text" 
                                    required 
                                    value={enteredPin}
                                    onChange={(e) => setEnteredPin(e.target.value)}
                                    placeholder="Enter PIN"
                                    style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '8px', width: '100%' }}
                                    maxLength={4}
                                    className="form-control"
                                />
                            </div>

                            <button type="submit" className="btn btn-primary w-100" style={{ padding: '14px', fontSize: '16px' }}>
                                Verify & Get Check-Out QR
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'show-checkout-qr') {
        const checkoutQrUrl = `${window.location.origin}/mobile-action?id=${visitorId}&action=checkout`;

        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                    <i className="fa-solid fa-lock-open text-primary" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
                    <h2>Your Check-Out Pass</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', marginTop: '8px' }}>
                        PIN verified! Present this <strong>Check-Out QR Code</strong> at the exit gate when leaving.
                    </p>
                    
                    <div style={{ background: 'white', padding: '20px', display: 'inline-block', borderRadius: '16px', marginBottom: '24px' }}>
                        <QRCodeSVG value={checkoutQrUrl} size={220} />
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        Visitor: <strong>{visitor?.name}</strong> | Host: <strong>{visitor?.hostName}</strong>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                {status === 'success-out' && (
                    <div>
                        <i className="fa-solid fa-person-walking-arrow-right text-primary" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                        <h2 style={{ color: 'var(--accent-primary)' }}>Checked Out Successfully!</h2>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Thank you for visiting. Have a safe journey!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
