import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { db } from '../db';
import { sendTelegramMessage } from '../telegram';
import Badge from '../components/Badge';
import './Scanner.css'; // Reuse scanner styles

export default function MobileAction() {
    const [searchParams] = useSearchParams();
    const visitorId = searchParams.get('id');
    const actionParam = searchParams.get('action');
    
    const [visitor, setVisitor] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready-checkin, checkin-done, success-out, error
    const [processing, setProcessing] = useState(false);

    const badgeRef = useRef(null);
    const statusRef = useRef(status);
    statusRef.current = status;
    const isProcessingCheckIn = useRef(false);

    const handlePrint = useReactToPrint({
        contentRef: badgeRef,
        documentTitle: visitor ? `Visitor_Badge_${visitor.id}` : 'Visitor_Badge',
    });

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
                        if (statusRef.current !== 'success-out') setStatus('success-out');
                    } else {
                        await db.visitors.update(v.id, {
                            status: 'checked-out',
                            checkOutTime: new Date().toISOString(),
                            auth_pin: null
                        });
                        if (statusRef.current !== 'success-out') setStatus('success-out');
                    }
                    return;
                }

                // 2. Visitor scans Check-In QR on mobile (Trigger single Telegram message)
                if ((v.status === 'registered' || v.status === 'expected') && !isProcessingCheckIn.current) {
                    isProcessingCheckIn.current = true;
                    
                    // Generate PIN for Host
                    const pin = Math.floor(1000 + Math.random() * 9000).toString();
                    
                    await db.visitors.update(v.id, {
                        status: 'checked-in',
                        checkInTime: new Date().toISOString(),
                        auth_pin: pin
                    });

                    // Send Telegram PIN to Host
                    await sendTelegramMessage(v.name, v.hostName, pin);

                    v.status = 'checked-in';
                    v.auth_pin = pin;
                    setVisitor(v);
                    if (statusRef.current !== 'success-out') setStatus('checkin-done');
                } else if (v.status === 'checked-in') {
                    if (statusRef.current !== 'success-out') setStatus('checkin-done');
                } else if (v.status === 'checked-out') {
                    if (statusRef.current !== 'success-out') setStatus('success-out');
                } else if (v.status !== 'registered' && v.status !== 'expected') {
                    if (statusRef.current !== 'error') setStatus('error');
                }
            } catch (err) {
                console.error("MobileAction Error:", err);
                if (statusRef.current !== 'error') setStatus('error');
            }
        };

        handleFlow();

        // Polling interval to automatically update page when status changes
        const interval = setInterval(handleFlow, 1500);
        return () => clearInterval(interval);
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

    if (status === 'loading') return <div style={{padding: '32px', textAlign: 'center', color: 'white'}}>Loading Visitor Info...</div>;
    if (status === 'error') return <div style={{padding: '32px', textAlign: 'center', color: 'var(--danger)'}}><h2>Invalid or Pass Expired</h2></div>;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
            {/* Hidden Printable Badge */}
            <Badge ref={badgeRef} visitor={visitor} />

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

                {/* State 2: Entrance Scan Complete */}
                {status === 'checkin-done' && (
                    <div>
                        <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '56px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--success)', marginBottom: '8px' }}>Entrance Approved!</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
                            You are checked in. A 4-digit PIN has been sent to <strong>{visitor?.hostName}</strong> via Telegram.
                        </p>

                        <button 
                            type="button" 
                            className="btn btn-primary w-100" 
                            onClick={handlePrint}
                            style={{ 
                                margin: '16px 0', 
                                padding: '14px', 
                                fontSize: '16px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '8px' 
                            }}
                        >
                            <i className="fa-solid fa-print"></i>
                            Print Visitor Badge
                        </button>

                        <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                                ℹ️ Please obtain the PIN from your host and verify at the security desk to get your Exit Pass when leaving.
                            </p>
                        </div>
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
                            <QRCodeSVG value={`${(window.location.origin.includes('.vercel.app')) ? 'https://visitor-site-texplus.vercel.app' : window.location.origin}/mobile-action?id=${visitorId}&action=checkout`} size={220} />
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
