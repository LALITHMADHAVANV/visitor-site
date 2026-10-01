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

                // 2. Visitor scans Check-In QR on mobile (Trigger arrival message to Host)
                if ((v.status === 'registered' || v.status === 'expected') && !isProcessingCheckIn.current) {
                    isProcessingCheckIn.current = true;
                    
                    await db.visitors.update(v.id, {
                        status: 'checked-in',
                        checkInTime: new Date().toISOString()
                    });

                    // Send Telegram Arrival Alert to Host
                    await sendTelegramMessage(v);

                    v.status = 'checked-in';
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
            await db.visitors.update(visitor.id, {
                status: 'checked-in',
                checkInTime: new Date().toISOString()
            });

            // Dispatch Telegram arrival notification to Host
            await sendTelegramMessage(visitor);
            
            setVisitor(prev => ({ ...prev, status: 'checked-in' }));
            setStatus('checkin-done');
        } catch (err) {
            console.error("Check-in error:", err);
            setStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    if (status === 'loading') return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '36px', color: 'var(--accent-primary)' }}></i>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Loading Visitor Info...</p>
            </div>
        </div>
    );

    if (status === 'error') return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', textAlign: 'center' }}>
            <div className="glass-panel" style={{ padding: '32px', maxWidth: '400px', width: '100%' }}>
                <i className="fa-solid fa-circle-exclamation text-danger" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
                <h2 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Invalid or Pass Expired</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Please contact security or register again at the kiosk.</p>
            </div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-dark)' }}>
            {/* Hidden Printable Badge */}
            <Badge ref={badgeRef} visitor={visitor} />

            <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '6px' }}>
                    <i className="fa-solid fa-shield-halved" style={{ fontSize: '26px', color: 'var(--accent-primary)' }}></i>
                    <h2 style={{ margin: 0, fontSize: '22px' }}>Security Verification</h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                    {actionParam === 'checkout' ? 'Exit Gate Check-Out Verification' : 'Entrance Gate Check-In Verification'}
                </p>
                
                {/* Visitor Info & Face Verification Summary */}
                {visitor && (
                    <div style={{ 
                        background: '#ffffff', 
                        border: '1.5px solid var(--border-color)', 
                        borderRadius: '16px', 
                        padding: '20px', 
                        marginBottom: '20px',
                        boxShadow: 'var(--shadow)',
                        textAlign: 'center'
                    }}>
                        {/* Visitor Face Photo Display */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px' }}>
                            <div style={{
                                width: '120px',
                                height: '120px',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                border: '3px solid var(--accent-primary)',
                                background: '#f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                                marginBottom: '10px'
                            }}>
                                {visitor.photoData || visitor.photo_data || visitor.photo ? (
                                    <img 
                                        src={visitor.photoData || visitor.photo_data || visitor.photo} 
                                        alt={visitor.name} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                                        <i className="fa-solid fa-user-shield" style={{ fontSize: '44px', color: '#cbd5e1', marginBottom: '4px' }}></i>
                                        <p style={{ margin: 0, fontSize: '11px', fontWeight: '600' }}>No Face Photo</p>
                                    </div>
                                )}
                            </div>

                            <span style={{
                                background: 'rgba(37, 99, 235, 0.12)',
                                color: 'var(--accent-primary)',
                                fontSize: '11px',
                                fontWeight: '700',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                letterSpacing: '0.4px',
                                textTransform: 'uppercase'
                            }}>
                                <i className="fa-solid fa-camera"></i>
                                Verified Visitor Face
                            </span>
                        </div>

                        {/* Visitor Identity Details */}
                        <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '14px', textAlign: 'left' }}>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: 'var(--text-primary)', textAlign: 'center' }}>
                                {visitor.name}
                            </h3>
                            {visitor.company && (
                                <p style={{ margin: '0 0 10px 0', textAlign: 'center', color: 'var(--accent-primary)', fontSize: '13px', fontWeight: '600' }}>
                                    <i className="fa-solid fa-building" style={{ marginRight: '5px' }}></i>
                                    {visitor.company}
                                </p>
                            )}

                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'auto 1fr', 
                                rowGap: '6px', 
                                columnGap: '12px', 
                                fontSize: '13px', 
                                marginTop: '10px',
                                background: '#f8fafc',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1px solid #f1f5f9'
                            }}>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Pass ID:</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-primary)' }}>{visitor.visitorNo || visitor.id}</span>

                                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Host:</span>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{visitor.hostName || '-'}</span>

                                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Purpose:</span>
                                <span style={{ color: 'var(--text-primary)' }}>{visitor.purpose || '-'}</span>

                                {visitor.idType && (
                                    <>
                                        <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{visitor.idType}:</span>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{visitor.idNumber || '-'}</span>
                                    </>
                                )}

                                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Status:</span>
                                <div>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase',
                                        background: visitor.status === 'checked-in' ? 'rgba(5, 150, 105, 0.15)' : visitor.status === 'checked-out' ? 'rgba(100, 116, 139, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                                        color: visitor.status === 'checked-in' ? 'var(--success)' : visitor.status === 'checked-out' ? '#475569' : 'var(--accent-primary)'
                                    }}>
                                        {visitor.status === 'checked-in' ? '● Checked In' : visitor.status === 'checked-out' ? '● Checked Out' : '● Registered'}
                                    </span>
                                </div>
                            </div>
                        </div>
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
                            You are checked in. An arrival notification has been sent to your host <strong>{visitor?.hostName}</strong> via Telegram.
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

                        <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                                ℹ️ Please proceed to meet your host. When leaving, check out at the security desk.
                            </p>
                        </div>
                    </div>
                )}

                {/* State 4: Display Exit QR Code (Visitor Shows to Security at Exit) */}
                {status === 'show-exit-qr' && (
                    <div>
                        <i className="fa-solid fa-lock-open text-primary" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
                        <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Check-Out Exit Pass</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                            Present this <strong>Exit QR Code</strong> to Security at the gate to check out:
                        </p>
                        
                        <div style={{ background: 'white', padding: '20px', display: 'inline-block', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)' }}>
                            <QRCodeSVG value={`${(window.location.origin.includes('.vercel.app')) ? 'https://visitor-site-texplus.vercel.app' : window.location.origin}/mobile-action?id=${visitorId}&action=checkout`} size={220} />
                        </div>

                        <p style={{ color: 'var(--success)', fontSize: '14px', fontWeight: 'bold' }}>
                            ✓ Authorized Exit Pass
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
