import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { db, generateVisitorId } from '../db';
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
                status: isKiosk ? 'registered' : 'checked-in', // Kiosk gives QR right away
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
        setFormData({ name: '', phone: '', company: '', hostName: '', purpose: '' });
        setPhotoData(null);
    };

    if (successQR) {
        const qrUrl = `${window.location.origin}/mobile-action?id=${successQR}`;
        
        return (
            <section className="view-section active">
                <div className="glass-panel form-container" style={{ textAlign: 'center', padding: '64px 32px' }}>
                    <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '64px', marginBottom: '24px' }}></i>
                    <h2>Registration Successful!</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                        Scan this code with your smartphone to control your check-in/out!
                    </p>
                    
                    <div style={{ background: 'white', padding: '24px', display: 'inline-block', borderRadius: '16px', marginBottom: '32px' }}>
                        <QRCodeSVG value={qrUrl} size={256} />
                    </div>
                    
                    <p style={{ fontFamily: 'monospace', fontSize: '18px', color: 'var(--accent-primary)', marginBottom: '32px' }}>
                        {successQR}
                    </p>

                    <div>
                        <button className="btn btn-primary" onClick={handleNextVisitor}>
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
                        <button type="submit" className="btn btn-primary">Register & Check In</button>
                    </div>
                </form>
            </div>
        </section>
    );
}
