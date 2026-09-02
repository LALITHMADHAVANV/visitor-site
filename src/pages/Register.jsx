import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { db, generateVisitorId } from '../db';
import { supabase } from '../supabaseClient';
import './Register.css';

export default function Register({ isKiosk = false }) {
    const webcamRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    
    const [photoData, setPhotoData] = useState(null);
    const [successQR, setSuccessQR] = useState(null);

    const [formData, setFormData] = useState({
        name: location.state?.preregData?.name || '',
        phone: '',
        company: location.state?.preregData?.company || '',
        hostName: location.state?.preregData?.hostName || '',
        purpose: location.state?.preregData?.purpose || ''
    });

    const capture = useCallback(() => {
        const imageSrc = webcamRef.current.getScreenshot();
        setPhotoData(imageSrc);
    }, [webcamRef]);

    const retake = () => {
        setPhotoData(null);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            const visitorId = await generateVisitorId();
            
            const visitor = {
                id: visitorId,
                name: formData.name.trim(),
                phone: formData.phone.trim(),
                company: formData.company.trim(),
                hostName: formData.hostName.trim(),
                purpose: formData.purpose.trim(),
                photoData: photoData,
                status: isKiosk ? 'registered' : 'checked-in',
                checkInTime: isKiosk ? null : new Date().toISOString(),
                checkOutTime: null
            };
            
            await db.visitors.add(visitor);
            
            if (location.state?.preregData?.id) {
                await db.preregistered.update(location.state.preregData.id, { status: 'arrived' });
            }
            
            if (isKiosk) {
                setSuccessQR(visitorId);
            } else {
                alert(`Visitor Registered Successfully!\nVisitor ID: ${visitorId}`);
                navigate('/dashboard');
            }
            
        } catch (error) {
            console.error("Registration Error:", error);
            alert("Error saving visitor data: " + (error.message || JSON.stringify(error)));
        }
    };

    const handleNextVisitor = () => {
        setSuccessQR(null);
        setVisitorStatus('registered');
        setUnlockedExitQR(false);
        setEnteredPin('');
        setPinError('');
        setFormData({ name: '', phone: '', company: '', hostName: '', purpose: '' });
        setPhotoData(null);
    };

    const [visitorStatus, setVisitorStatus] = useState('registered');
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [unlockedExitQR, setUnlockedExitQR] = useState(false);

    const statusRef = useRef(visitorStatus);
    statusRef.current = visitorStatus;

    // Auto-poll & Realtime listener for visitor status while QR is displayed on Kiosk
    useEffect(() => {
        if (!successQR) return;
        
        // Reset state for new visitor QR display
        setVisitorStatus('registered');
        setUnlockedExitQR(false);
        setEnteredPin('');
        setPinError('');

        const checkStatus = async () => {
            try {
                const v = await db.visitors.get(successQR);
                if (v && v.status) {
                    const currentStat = v.status.trim();
                    if (currentStat !== statusRef.current) {
                        console.log("Kiosk status updated from DB:", currentStat);
                        setVisitorStatus(currentStat);
                    }
                }
            } catch (err) {
                console.error("Kiosk polling error:", err);
            }
        };

        // 1. Initial check & fast interval polling
        checkStatus();
        const interval = setInterval(checkStatus, 90);

        // 2. Supabase Realtime WebSocket listener for instant push update
        let channel;
        try {
            channel = supabase
                .channel(`kiosk-visitor-${successQR}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visitors', filter: `id=eq.${successQR}` }, (payload) => {
                    if (payload.new && payload.new.status) {
                        const newStatus = payload.new.status.trim();
                        console.log("Realtime status push received:", newStatus);
                        setVisitorStatus(newStatus);
                    }
                })
                .subscribe();
        } catch (e) {
            console.error("Realtime subscription error:", e);
        }

        return () => {
            clearInterval(interval);
            if (channel) supabase.removeChannel(channel);
        };
    }, [successQR]);

    const handlePinVerifyOnKiosk = async (e) => {
        e.preventDefault();
        setPinError('');
        try {
            const v = await db.visitors.get(successQR);
            if (v && v.auth_pin === enteredPin) {
                setUnlockedExitQR(true);
            } else {
                setPinError('Invalid PIN. Please enter the code sent to your host.');
            }
        } catch (err) {
            setPinError('Error verifying PIN.');
        }
    };

    if (successQR) {
        const qrUrl = `${window.location.origin}/mobile-action?id=${successQR}&action=checkin`;
        const exitQrUrl = `${window.location.origin}/mobile-action?id=${successQR}&action=checkout`;
        
        return (
            <section className="view-section active">
                <div className="glass-panel form-container" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '500px', margin: '0 auto' }}>
                    {visitorStatus === 'registered' && (
                        <>
                            <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '64px', marginBottom: '24px' }}></i>
                            <h2>Registration Successful!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Scan this <strong>Check-In QR Code</strong> at the security desk to check in.
                            </p>
                            
                            <div style={{ background: 'white', padding: '24px', display: 'inline-block', borderRadius: '16px', marginBottom: '24px' }}>
                                <QRCodeSVG value={qrUrl} size={240} />
                            </div>
                            
                            <p style={{ fontFamily: 'monospace', fontSize: '18px', color: 'var(--accent-primary)', marginBottom: '24px' }}>
                                ID: {successQR}
                            </p>
                        </>
                    )}

                    {visitorStatus === 'checked-in' && !unlockedExitQR && (
                        <>
                            <i className="fa-solid fa-user-check text-success" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                            <h2 style={{ color: 'var(--success)', marginBottom: '8px' }}>Entrance Approved!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                                You are checked in. A 4-digit PIN has been sent to your host via Telegram.
                            </p>

                            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '24px', borderRadius: '16px', marginBottom: '24px' }}>
                                <h3>Unlock Exit Pass</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                                    Enter the 4-digit PIN from your host to generate your <strong>Check-Out Exit Pass</strong>:
                                </p>
                                
                                <form onSubmit={handlePinVerifyOnKiosk}>
                                    {pinError && <div className="text-danger" style={{ marginBottom: '12px' }}>{pinError}</div>}
                                    <input 
                                        type="text" 
                                        required 
                                        value={enteredPin}
                                        onChange={(e) => setEnteredPin(e.target.value)}
                                        placeholder="Enter PIN"
                                        style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '8px', width: '100%', marginBottom: '16px' }}
                                        maxLength={4}
                                        className="form-control"
                                    />
                                    <button type="submit" className="btn btn-primary w-100">
                                        Unlock Exit QR Pass
                                    </button>
                                </form>
                            </div>
                        </>
                    )}

                    {(visitorStatus === 'checked-in' && unlockedExitQR) && (
                        <>
                            <i className="fa-solid fa-lock-open text-primary" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                            <h2>Your Exit QR Pass</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Show this <strong>Exit QR Code</strong> to Security when leaving to check out:
                            </p>
                            
                            <div style={{ background: 'white', padding: '20px', display: 'inline-block', borderRadius: '16px', marginBottom: '24px' }}>
                                <QRCodeSVG value={exitQrUrl} size={220} />
                            </div>
                        </>
                    )}

                    {visitorStatus === 'checked-out' && (
                        <>
                            <i className="fa-solid fa-person-walking-arrow-right text-primary" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                            <h2 style={{ color: 'var(--accent-primary)' }}>Checked Out!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Thank you for visiting.</p>
                        </>
                    )}

                    <div style={{ marginTop: '24px' }}>
                        <button className="btn btn-outline" onClick={handleNextVisitor}>
                            Done / Next Visitor
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="view-section active">
            <div className="glass-panel form-container">
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        {/* Photo Capture */}
                        <div className="photo-section">
                            <div className="camera-container">
                                {!photoData ? (
                                    <>
                                        <Webcam
                                            audio={false}
                                            ref={webcamRef}
                                            screenshotFormat="image/jpeg"
                                            videoConstraints={{ width: 400, height: 400, facingMode: "user" }}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div className="camera-overlay">
                                            <i className="fa-solid fa-camera"></i>
                                        </div>
                                    </>
                                ) : (
                                    <img src={photoData} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 1 }} />
                                )}
                            </div>
                            <div className="camera-actions" style={{ marginTop: '16px' }}>
                                {!photoData ? (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={capture}>Take Photo</button>
                                ) : (
                                    <button type="button" className="btn btn-outline btn-sm" onClick={retake}>Retake</button>
                                )}
                            </div>
                        </div>
                        
                        {/* Form Fields */}
                        <div className="fields-section">
                            <div className="form-group">
                                <label>Full Name *</label>
                                <input type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="John Doe" />
                            </div>
                            <div className="form-group">
                                <label>Phone Number *</label>
                                <input type="tel" name="phone" required value={formData.phone} onChange={handleChange} placeholder="e.g. +1 234 567 8900" />
                            </div>
                            <div className="form-group">
                                <label>Company Name</label>
                                <input type="text" name="company" value={formData.company} onChange={handleChange} placeholder="Acme Corp (Optional)" />
                            </div>
                            <div className="form-group">
                                <label>Person to Meet / Dept *</label>
                                <input type="text" name="hostName" required value={formData.hostName} onChange={handleChange} placeholder="Jane Smith / HR" />
                            </div>
                            <div className="form-group full-width">
                                <label>Purpose of Visit *</label>
                                <input type="text" name="purpose" required value={formData.purpose} onChange={handleChange} placeholder="Meeting, Interview, Delivery, etc." />
                            </div>
                        </div>
                    </div>
                    
                    <div className="form-actions mt-4" style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-outline" onClick={() => navigate('/')}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Register & Get Check-In QR</button>
                    </div>
                </form>
            </div>
        </section>
    );
}
