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
    const [status, setStatus] = useState('loading'); // loading, ready-checkin, checkin-done, enter-pin, show-exit-qr, success-out, error
    
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!visitorId) {
            setStatus('error');
            return;
        }

        const handleFlow = async () => {
            try {
                const v = await db.visitors.get(visitorId);
                if (!v) {
                    setStatus('error');
                    return;
                }
                setVisitor(v);

                // 1. Security Exit Scan (`action=checkout`)
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

                // 2. Entrance Scan (`action=checkin`)
                if (actionParam === 'checkin' && (v.status === 'registered' || v.status === 'expected')) {
                    setStatus('ready-checkin');
                    return;
                }

                // 3. General Visitor Link Access (Visitor on their phone)
                if (v.status === 'registered' || v.status === 'expected') {
                    setStatus('ready-checkin');
                } else if (v.status === 'checked-in') {
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

    // Security Check-In Action
    const handleConfirmCheckIn = async () => {
        if (!visitor) return;
        setProcessing(true);
        try {
            // Generate 4-digit Host PIN
            const pin = Math.floor(1000 + Math.random() * 9000).toString();
            
            await db.visitors.update(visitor.id, {
                status: 'checked-in',
                checkInTime: new Date().toISOString(),
                auth_pin: pin
            });

            // Dispatch Telegram message to Host
            await sendTelegramMessage(visitor.name, visitor.hostName, pin);
            
            setVisitor(prev => ({ ...prev, status: 'checked-in', auth_pin: pin }));
            setStatus('checkin-done');
        } catch (err) {
            console.error("Check-in error:", err);
            setStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    // Visitor PIN Verification Action (On Visitor's Phone)
    const handlePinVerification = async (e) => {
        e.preventDefault();
        setPinError('');
        
        if (!enteredPin) {
            setPinError('Please enter the 4-digit PIN from your host.');
            return;
        }

        setProcessing(true);
        try {
            const v = await db.visitors.get(visitorId);
            
            if (v && v.auth_pin === enteredPin) {
                // PIN verified! Show Exit QR Code
                setStatus('show-exit-qr');
            } else {
                setPinError('Invalid PIN. Please ask your host for the 4-digit code sent to their Telegram.');
            }
        } catch (error) {
            console.error("PIN Verification Error:", error);
            setPinError('Error verifying PIN.');
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
                
                {/* Visitor Info Summary */}
                {visitor && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left' }}>
                        <p style={{ margin: '4px 0', color: 'white' }}><strong>Visitor:</strong> {visitor.name}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}><strong>Host:</strong> {visitor.hostName}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}><strong>Purpose:</strong> {visitor.purpose}</p>
                        <p style={{ margin: '4px 0', color: 'var(--text-secondary)', fontFamily: 'monospace' }}><strong>ID:</strong> {visitor.id}</p>
                    </div>
                )}

                {/* State 1: Security Entrance Scan (Security Clicks Check In) */}
                {status === 'ready-checkin' && (
                    <div>
                        <button 
                            className="btn btn-primary w-100" 
                            style={{ padding: '16px', fontSize: '18px' }}
                            onClick={handleConfirmCheckIn}
                            disabled={processing}
                        >
                            {processing ? 'Processing...' : 'Confirm Entrance Check In'}
                        </button>
                    </div>
                )}

                {/* State 2: Security Entrance Scan Complete */}
                {status === 'checkin-done' && (
                    <div>
                        <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--success)', marginBottom: '8px' }}>Entrance Approved!</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            Visitor is checked in. Telegram PIN sent to <strong>{visitor?.hostName}</strong>.
                        </p>
                    </div>
                )}

                {/* State 3: Visitor Enters Host PIN on Visitor Phone */}
                {status === 'enter-pin' && (
                    <div>
                        <h3 style={{ color: 'white', marginBottom: '8px' }}>Unlock Exit Pass</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                            A 4-digit PIN was sent to <strong>{visitor?.hostName}</strong> via Telegram. Enter it below to unlock your <strong>Exit QR Code</strong>:
                        </p>

                        <form onSubmit={handlePinVerification}>
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
                                {processing ? 'Verifying...' : 'Verify & Unlock Exit QR'}
                            </button>
                        </form>
                    </div>
                )}

                {/* State 4: Display Exit QR Code (Visitor Shows to Security at Exit) */}
                {status === 'show-exit-qr' && (
                    <div>
                        <i className="fa-solid fa-lock-open text-primary" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'white', marginBottom: '8px' }}>Check-Out Exit Pass</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                            Present this <strong>Exit QR Code</strong> to Security at the gate to check out:
                        </p>
                        
                        <div style={{ background: 'white', padding: '20px', display: 'inline-block', borderRadius: '16px', marginBottom: '24px' }}>
                            <QRCodeSVG value={`${window.location.origin}/mobile-action?id=${visitorId}&action=checkout`} size={220} />
                        </div>

                        <p style={{ color: 'var(--success)', fontSize: '14px', fontWeight: 'bold' }}>
                            ✓ Host PIN Verified
                        </p>
                    </div>
                )}

                {/* State 5: Security Scanned Exit QR Code (Checked Out) */}
                {status === 'success-out' && (
                    <div>
                        <i className="fa-solid fa-person-walking-arrow-right text-primary" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--accent-primary)', marginBottom: '8px' }}>Checked Out Successfully!</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Thank you for visiting. Have a safe trip!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
