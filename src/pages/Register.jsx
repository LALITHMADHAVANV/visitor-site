import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { db, generateVisitorId } from '../db';
import { supabase } from '../supabaseClient';
import { OFFICE_HOSTS } from '../hosts';
import Badge, { THERMAL_80MM_PAGE_STYLE } from '../components/Badge';
import { generateNameAvatar } from '../avatarUtils';
import { sendTelegramMessage } from '../telegram';
import './Register.css';

const getIdValidation = (type, val) => {
    const trimmed = (val || '').trim();
    if (!type) {
        return { isValid: false, badgeText: '', errorHint: '', maxLen: 30 };
    }
    switch (type) {
        case 'Aadhar Number': {
            const isValid = trimmed.length === 12;
            const badgeText = `${trimmed.length}/12 Digits`;
            const errorHint = trimmed.length > 0 && trimmed.length < 12 
                ? `Must be exactly 12 digits (${12 - trimmed.length} more needed)` 
                : '';
            return { isValid, badgeText, errorHint, maxLen: 12 };
        }
        case 'PAN Number': {
            const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
            const isValid = panPattern.test(trimmed);
            const badgeText = `${trimmed.length}/10 Chars`;
            let errorHint = '';
            if (trimmed.length > 0 && trimmed.length < 10) {
                errorHint = `Must be exactly 10 characters (${10 - trimmed.length} more needed)`;
            } else if (trimmed.length === 10 && !isValid) {
                errorHint = 'Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)';
            }
            return { isValid, badgeText, errorHint, maxLen: 10 };
        }
        case 'Passport': {
            const passPattern = /^[A-Z][0-9]{7}$/;
            const isValid = trimmed.length === 8 && passPattern.test(trimmed);
            const badgeText = `${trimmed.length}/8 Chars`;
            let errorHint = '';
            if (trimmed.length > 0 && trimmed.length < 8) {
                errorHint = `Must be 8 characters (${8 - trimmed.length} more needed)`;
            } else if (trimmed.length === 8 && !passPattern.test(trimmed)) {
                errorHint = 'Standard format: 1 letter followed by 7 digits (e.g. A1234567)';
            }
            return { isValid, badgeText, errorHint, maxLen: 8 };
        }
        case 'Voter ID': {
            const isValid = trimmed.length === 10;
            const badgeText = `${trimmed.length}/10 Chars`;
            const errorHint = trimmed.length > 0 && trimmed.length < 10 
                ? `Must be 10 characters (${10 - trimmed.length} more needed)` 
                : '';
            return { isValid, badgeText, errorHint, maxLen: 10 };
        }
        case 'Driving License': {
            const isValid = trimmed.length >= 10;
            const badgeText = `${trimmed.length} Chars`;
            const errorHint = trimmed.length > 0 && trimmed.length < 10 
                ? `Minimum 10 characters required (${10 - trimmed.length} more needed)` 
                : '';
            return { isValid, badgeText, errorHint, maxLen: 16 };
        }
        case 'Company ID': {
            const isValid = trimmed.length >= 3;
            const badgeText = `${trimmed.length} Chars`;
            const errorHint = trimmed.length > 0 && trimmed.length < 3 ? 'Minimum 3 characters required' : '';
            return { isValid, badgeText, errorHint, maxLen: 20 };
        }
        default: { // Other Government ID
            const isValid = trimmed.length >= 4;
            const badgeText = `${trimmed.length} Chars`;
            const errorHint = trimmed.length > 0 && trimmed.length < 4 ? 'Minimum 4 characters required' : '';
            return { isValid, badgeText, errorHint, maxLen: 25 };
        }
    }
};

export default function Register({ isKiosk = false }) {
    const webcamRef = useRef(null);
    const badgeRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    
    const [photoData, setPhotoData] = useState(null);
    const [successQR, setSuccessQR] = useState(null);
    const [registeredVisitor, setRegisteredVisitor] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [finding, setFinding] = useState(false);
    const [findResult, setFindResult] = useState(null); // 'found', 'not-found', null

    const handlePrint = useReactToPrint({
        contentRef: badgeRef,
        documentTitle: registeredVisitor ? `Visitor_Badge_${registeredVisitor.id}` : 'Visitor_Badge',
        pageStyle: THERMAL_80MM_PAGE_STYLE,
    });

    const [formData, setFormData] = useState({
        visitorNo: '',
        name: location.state?.preregData?.name || '',
        phone: '',
        company: location.state?.preregData?.company || '',
        idType: '',
        idNumber: '',
        hasVehicle: 'no',
        vehicleNo: 'No',
        hasExtraMembers: 'no',
        extraMembersCount: '',
        extraMembersIds: '',
        hostName: location.state?.preregData?.hostName || '',
        purpose: location.state?.preregData?.purpose || ''
    });

    const idValidation = getIdValidation(formData.idType, formData.idNumber);


    const capture = useCallback(() => {
        const imageSrc = webcamRef.current.getScreenshot();
        setPhotoData(imageSrc);
    }, [webcamRef]);

    const retake = () => {
        setPhotoData(null);
    };

    // Find existing visitor by phone number
    const findByPhone = async () => {
        const phone = formData.phone.trim();
        if (phone.length !== 10) {
            alert('Please enter a valid 10-digit mobile number first.');
            return;
        }
        setFinding(true);
        setFindResult(null);
        try {
            // Search in all visitors (Supabase) for this phone number, get the latest one
            const allVisitors = await db.visitors.toArray();
            const matches = allVisitors
                .filter(v => v.phone === phone)
                .sort((a, b) => {
                    const timeA = new Date(a.checkInTime || a.created_at || 0).getTime();
                    const timeB = new Date(b.checkInTime || b.created_at || 0).getTime();
                    return timeB - timeA; // latest first
                });

            if (matches.length > 0) {
                const prev = matches[0];
                // Auto-fill form fields from previous visit
                setFormData(f => ({
                    ...f,
                    name: prev.name || f.name,
                    company: prev.company || f.company,
                    idType: prev.idType || f.idType,
                    idNumber: prev.idNumber || f.idNumber,
                    hostName: prev.hostName || prev.hostname || f.hostName,
                    purpose: prev.purpose
                        ? prev.purpose
                            .replace(/\[ID:.*?\]/g, '')
                            .replace(/\[Vehicle:.*?\]/g, '')
                            .replace(/\[Extra:.*?\]/g, '')
                            .trim() || f.purpose
                        : f.purpose,
                    hasVehicle: prev.hasVehicle === 'yes' ? 'yes' : 'no',
                    vehicleNo: prev.vehicleNo && prev.vehicleNo !== 'No' ? prev.vehicleNo : (f.vehicleNo || 'No'),
                }));
                // Set photo if available
                if (prev.photoData && !photoData) {
                    setPhotoData(prev.photoData);
                }
                setFindResult('found');
            } else {
                setFindResult('not-found');
            }
        } catch (err) {
            console.error('Find visitor error:', err);
            setFindResult('not-found');
        } finally {
            setFinding(false);
            // Clear the result message after 4 seconds
            setTimeout(() => setFindResult(null), 4000);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            // Strictly digits only, max 10 digits
            const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
            setFormData(prev => ({ ...prev, phone: digitsOnly }));
            return;
        }
        if (name === 'idType') {
            setFormData(prev => {
                let cleanedId = prev.idNumber;
                if (value === 'Aadhar Number') {
                    cleanedId = cleanedId.replace(/\D/g, '').slice(0, 12);
                } else if (value === 'PAN Number' || value === 'Voter ID') {
                    cleanedId = cleanedId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                } else if (value === 'Passport') {
                    cleanedId = cleanedId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                } else if (value === 'Driving License') {
                    cleanedId = cleanedId.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
                }
                return { ...prev, idType: value, idNumber: cleanedId };
            });
            return;
        }
        if (name === 'idNumber') {
            let formatted = value;
            if (formData.idType === 'Aadhar Number') {
                formatted = value.replace(/\D/g, '').slice(0, 12);
            } else if (formData.idType === 'PAN Number' || formData.idType === 'Voter ID') {
                formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
            } else if (formData.idType === 'Passport') {
                formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
            } else if (formData.idType === 'Driving License') {
                formatted = value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
            } else {
                formatted = value.toUpperCase().slice(0, 25);
            }
            setFormData(prev => ({ ...prev, idNumber: formatted }));
            return;
        }
        if (name === 'hasVehicle') {
            setFormData(prev => ({
                ...prev,
                hasVehicle: value,
                vehicleNo: value === 'no' ? 'No' : (prev.vehicleNo === 'No' ? '' : prev.vehicleNo)
            }));
            return;
        }
        if (name === 'hasExtraMembers') {
            setFormData(prev => ({
                ...prev,
                hasExtraMembers: value,
                extraMembersCount: value === 'no' ? '' : prev.extraMembersCount,
                extraMembersIds: value === 'no' ? '' : prev.extraMembersIds
            }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        // 1. Phone number validation: strictly exactly 10 digits
        const phoneDigits = formData.phone.trim();
        if (phoneDigits.length !== 10) {
            alert(`Phone number must be exactly 10 digits. Currently entered: ${phoneDigits.length} digits.`);
            return;
        }

        // 2. ID Proof validation: mandatory and format check
        if (!formData.idType) {
            alert("Please select an ID Proof Type.");
            return;
        }
        const idNumberTrimmed = formData.idNumber.trim();
        if (!idNumberTrimmed) {
            alert(`Please enter the ID Number for the selected ID Proof Type (${formData.idType}).`);
            return;
        }
        const idCheck = getIdValidation(formData.idType, idNumberTrimmed);
        if (!idCheck.isValid) {
            alert(idCheck.errorHint || `Please enter a valid ${formData.idType}.`);
            return;
        }

        // 3. Duplicate check for active visits (Phone Number and ID Proof Number)
        try {
            const allVisitors = await db.visitors.toArray();
            const activeVisitor = allVisitors.find(v => 
                v.status === 'checked-in' && (
                    v.phone === phoneDigits || 
                    (v.idNumber && v.idNumber.trim().toUpperCase() === idNumberTrimmed.toUpperCase())
                )
            );
            if (activeVisitor) {
                const matchType = activeVisitor.phone === phoneDigits ? `Phone Number (${phoneDigits})` : `ID Proof Number (${idNumberTrimmed})`;
                alert(`Cannot register: A visitor with this ${matchType} (${activeVisitor.name || 'Visitor'}) is currently checked in. They must check out before registering again.`);
                return;
            }
        } catch (err) {
            console.warn("Could not check active visitor records:", err);
        }

        // 3. Vehicle validation
        if (formData.hasVehicle === 'yes' && (!formData.vehicleNo.trim() || formData.vehicleNo === 'No')) {
            alert("Please enter the vehicle registration number.");
            return;
        }

        // 4. Extra Members validation
        if (formData.hasExtraMembers === 'yes') {
            const count = parseInt(formData.extraMembersCount);
            if (!count || count < 1) {
                alert("Please enter how many extra members are accompanying.");
                return;
            }
            if (!formData.extraMembersIds.trim()) {
                alert(`Mandatory: Please enter the Visitor ID number(s) for the ${count} accompanying member(s).`);
                return;
            }
        }

        setSubmitting(true);
        
        try {
            const visitorId = (formData.visitorNo && formData.visitorNo.trim()) || await generateVisitorId();
            
            const isSecurityEntry = !isKiosk;
            const now = new Date().toISOString();
            
            const visitor = {
                id: visitorId,
                visitorNo: visitorId,
                name: formData.name.trim(),
                phone: phoneDigits,
                company: formData.company.trim(),
                idType: formData.idType ? formData.idType.trim() : null,
                idNumber: formData.idNumber ? formData.idNumber.trim() : null,
                hasVehicle: formData.hasVehicle,
                vehicleNo: formData.hasVehicle === 'yes' ? formData.vehicleNo.trim() : 'No',
                hasExtraMembers: formData.hasExtraMembers,
                extraMembersCount: formData.hasExtraMembers === 'yes' ? (parseInt(formData.extraMembersCount) || 0) : 0,
                extraMembersIds: formData.hasExtraMembers === 'yes' ? formData.extraMembersIds.trim() : null,
                hostName: formData.hostName.trim(),
                purpose: formData.purpose.trim(),
                photoData: photoData || generateNameAvatar(formData.name.trim() || visitorId),
                status: isSecurityEntry ? 'checked-in' : 'registered',
                checkInTime: isSecurityEntry ? now : null,
                checkOutTime: null,
                auth_pin: null
            };
            
            await db.visitors.add(visitor);
            
            if (location.state?.preregData?.id) {
                await db.preregistered.update(location.state.preregData.id, { status: 'arrived' });
            }

            // If registered from security desk (New Visitor nav bar section), visitor is checked in immediately
            if (isSecurityEntry) {
                sendTelegramMessage(visitor).catch(err => console.error("Telegram alert error:", err));
                window.dispatchEvent(new CustomEvent('visitor-scan-processed', { 
                    detail: { 
                        visitor, 
                        action: 'checkin', 
                        timestamp: now 
                    } 
                }));
            }
            
            setRegisteredVisitor(visitor);
            setSuccessQR(visitorId);
            
        } catch (error) {
            console.error("Registration Error:", error);
            alert("Error saving visitor data: " + (error.message || JSON.stringify(error)));
        } finally {
            setSubmitting(false);
        }
    };

    const handleNextVisitor = () => {
        setSuccessQR(null);
        setRegisteredVisitor(null);
        setVisitorStatus('registered');
        setPhotoData(null);
        setFormData({
            visitorNo: '',
            name: '',
            phone: '',
            company: '',
            idType: '',
            idNumber: '',
            hasVehicle: 'no',
            vehicleNo: 'No',
            hasExtraMembers: 'no',
            extraMembersCount: '',
            extraMembersIds: '',
            hostName: '',
            purpose: ''
        });
    };

    const [visitorStatus, setVisitorStatus] = useState('registered');

    const statusRef = useRef(visitorStatus);
    statusRef.current = visitorStatus;

    // Auto-poll & Realtime listener for visitor status while QR is displayed on Kiosk
    useEffect(() => {
        if (!successQR) return;
        
        // Reset state for new visitor QR display
        setVisitorStatus('registered');

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

    const getCleanOrigin = () => {
        const origin = window.location.origin;
        if (origin.includes('.vercel.app')) {
            return 'https://visitor-site-texplus.vercel.app';
        }
        return origin;
    };

    // 1. Security View: Details card & instant Badge Printing
    if (registeredVisitor && !isKiosk) {
        return (
            <section className="view-section active">
                {/* Hidden Badge Component for Printing */}
                <Badge ref={badgeRef} visitor={registeredVisitor} />

                <div className="glass-panel form-container visitor-registered-card">
                    <div className="registered-success-header">
                        <i className="fa-solid fa-circle-check text-success registered-success-icon"></i>
                        <h2 className="registered-success-title">Visitor Registered & Checked In!</h2>
                        <span className="registered-badge-id">
                            {registeredVisitor.id}
                        </span>
                    </div>

                    {/* Visitor Details Summary Card */}
                    <div className="visitor-summary-card">
                        {/* Photo Thumbnail */}
                        <div className="visitor-summary-photo">
                            {registeredVisitor.photoData ? (
                                <img src={registeredVisitor.photoData} alt={registeredVisitor.name} />
                            ) : (
                                <img src={generateNameAvatar(registeredVisitor.name)} alt={registeredVisitor.name} />
                            )}
                        </div>

                        {/* Details */}
                        <div className="visitor-summary-details">
                            <h3 className="visitor-summary-name">{registeredVisitor.name}</h3>
                            {registeredVisitor.company && (
                                <p className="visitor-summary-company">
                                    <i className="fa-solid fa-building"></i>
                                    {registeredVisitor.company}
                                </p>
                            )}
                            <div className="visitor-summary-grid">
                                <div><strong>Visitor No:</strong> <span className="summary-val-badge">{registeredVisitor.visitorNo || registeredVisitor.id}</span></div>
                                <div><strong>Host:</strong> {registeredVisitor.hostName}</div>
                                <div><strong>Purpose:</strong> {registeredVisitor.purpose}</div>
                                <div><strong>Phone:</strong> {registeredVisitor.phone || 'N/A'}</div>
                                <div><strong>Vehicle:</strong> <span style={{ fontWeight: '600', color: registeredVisitor.vehicleNo && registeredVisitor.vehicleNo !== 'No' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{registeredVisitor.vehicleNo || 'No'}</span></div>
                                <div><strong>Extra Members:</strong> <span style={{ fontWeight: '600', color: registeredVisitor.hasExtraMembers === 'yes' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{registeredVisitor.hasExtraMembers === 'yes' ? `${registeredVisitor.extraMembersCount} (${registeredVisitor.extraMembersIds || 'IDs recorded'})` : 'No'}</span></div>
                                <div><strong>Check-In Time:</strong> {registeredVisitor.checkInTime ? new Date(registeredVisitor.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                {registeredVisitor.idType && (
                                    <div>
                                        <strong>ID ({registeredVisitor.idType}):</strong> <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{registeredVisitor.idNumber || 'Recorded'}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Check-Out / Exit QR Code */}
                    <div className="visitor-summary-qr-section">
                        <div className="visitor-summary-qr-box">
                            <QRCodeSVG 
                                value={`${getCleanOrigin()}/mobile-action?id=${registeredVisitor.id}&action=checkout`} 
                                size={160} 
                                level="H"
                                imageSettings={{
                                    src: '/company-logo.png',
                                    height: 36,
                                    width: 36,
                                    excavate: true
                                }}
                            />
                        </div>
                        <p className="qr-hint-text">
                            Exit / Check-Out QR Code (Scan upon departure)
                        </p>
                    </div>

                    {/* Telegram Host Arrival Alert Notice */}
                    <div className="telegram-alert-banner">
                        <i className="fa-brands fa-telegram"></i>
                        <div>
                            Arrival notification sent to <strong>{registeredVisitor.hostName}</strong> via Telegram.
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="registered-actions">
                        <button 
                            type="button" 
                            className="btn btn-primary btn-print-badge" 
                            onClick={handlePrint}
                        >
                            <i className="fa-solid fa-print"></i>
                            Print Visitor Badge
                        </button>
                        
                        <div className="registered-sub-actions">
                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={handleNextVisitor}
                            >
                                <i className="fa-solid fa-user-plus"></i>
                                Next Visitor
                            </button>

                            <button 
                                type="button" 
                                className="btn btn-outline" 
                                onClick={() => navigate('/dashboard')}
                            >
                                <i className="fa-solid fa-chart-line"></i>
                                Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    // 2. Kiosk Self-Service View
    if (successQR) {
        const cleanOrigin = getCleanOrigin();
        const qrUrl = `${cleanOrigin}/mobile-action?id=${successQR}&action=checkin`;
        const exitQrUrl = `${cleanOrigin}/mobile-action?id=${successQR}&action=checkout`;
        
        return (
            <section className="view-section active">
                <Badge ref={badgeRef} visitor={registeredVisitor} />
                <div className="glass-panel form-container kiosk-success-card">
                    {visitorStatus === 'registered' && (
                        <>
                            <i className="fa-solid fa-circle-check text-success kiosk-success-icon"></i>
                            <h2>Registration Successful!</h2>
                            <p className="kiosk-instruction-text">
                                Scan this <strong>Check-In QR Code</strong> at the security desk to check in.
                            </p>
                            
                            <div className="kiosk-qr-wrapper">
                                <QRCodeSVG 
                                    value={qrUrl} 
                                    size={220} 
                                    level="H"
                                    imageSettings={{
                                        src: '/company-logo.png',
                                        height: 48,
                                        width: 48,
                                        excavate: true
                                    }}
                                />
                            </div>
                            
                            <p className="kiosk-id-display">
                                ID: {successQR}
                            </p>
                        </>
                    )}

                    {visitorStatus === 'checked-in' && (
                        <>
                            <i className="fa-solid fa-circle-check text-success kiosk-success-icon"></i>
                            <h2 style={{ color: 'var(--success)' }}>Entrance Approved!</h2>
                            <p className="kiosk-instruction-text">
                                You are checked in. An arrival alert has been sent to your host via Telegram.
                            </p>

                            <div className="kiosk-exit-card">
                                <h3>Your Exit Pass</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '16px' }}>
                                    When you finish your visit, present this <strong>Exit QR Code</strong> at the security desk:
                                </p>
                                
                                <div className="kiosk-qr-wrapper-sm">
                                    <QRCodeSVG 
                                        value={exitQrUrl} 
                                        size={190} 
                                        level="H"
                                        imageSettings={{
                                            src: '/company-logo.png',
                                            height: 42,
                                            width: 42,
                                            excavate: true
                                        }}
                                    />
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                                    Please proceed to meet your host.
                                </p>
                            </div>
                        </>
                    )}

                    {visitorStatus === 'checked-out' && (
                        <>
                            <i className="fa-solid fa-person-walking-arrow-right text-primary kiosk-success-icon"></i>
                            <h2 style={{ color: 'var(--accent-primary)' }}>Checked Out!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Thank you for visiting.</p>
                        </>
                    )}

                    <div style={{ marginTop: '24px' }}>
                        <button className="btn btn-outline kiosk-btn-done" onClick={handleNextVisitor}>
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
                {isKiosk && (
                    <div className="kiosk-form-banner">
                        <img src="/company-logo.png" alt="Esstee Exports" className="kiosk-form-logo" />
                        <h2>
                            Welcome to <span style={{ color: 'var(--accent-primary)' }}>Esstee Exports</span>
                        </h2>
                        <p>
                            Self-service visitor check-in & digital pass registration
                        </p>
                    </div>
                )}
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
                                            screenshotQuality={0.92}
                                            videoConstraints={{ width: 640, height: 640, facingMode: "user" }}
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
                            <div className="camera-actions" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {!photoData ? (
                                    <>
                                        <button type="button" className="btn btn-capture-large" onClick={capture}>
                                            <i className="fa-solid fa-camera"></i> Capture Photo
                                        </button>
                                        {formData.name.trim() && (
                                            <button 
                                                type="button" 
                                                className="btn btn-secondary" 
                                                style={{ fontSize: '13px', padding: '9px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                onClick={() => setPhotoData(generateNameAvatar(formData.name))}
                                                title="Generate personalized avatar from name"
                                            >
                                                <i className="fa-solid fa-user-gear"></i> Use Name Avatar
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <button type="button" className="btn btn-retake-large" onClick={retake}>
                                        <i className="fa-solid fa-rotate-left"></i> Retake / Use Camera
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        {/* Form Fields */}
                        <div className="fields-section">
                            {/* Row 1: Visitor No & Full Name */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>
                                            <i className="fa-solid fa-id-badge" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                            Visitor ID / Badge No
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                            (Enter or click ↻ to generate)
                                        </span>
                                    </label>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <input 
                                            type="text" 
                                            name="visitorNo" 
                                            value={formData.visitorNo} 
                                            onChange={handleChange} 
                                            placeholder="Enter Visitor ID / Badge No"
                                            style={{ paddingRight: '40px', fontFamily: 'monospace', fontWeight: 'bold' }} 
                                        />
                                        <button
                                            type="button"
                                            title="Generate new Visitor No"
                                            onClick={async () => {
                                                const newId = await generateVisitorId();
                                                setFormData(prev => ({ ...prev, visitorNo: newId }));
                                            }}
                                            style={{
                                                position: 'absolute',
                                                right: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--accent-primary)',
                                                cursor: 'pointer',
                                                padding: '6px',
                                                fontSize: '14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <i className="fa-solid fa-rotate"></i>
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Full Name *</label>
                                    <input type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="John Doe" />
                                </div>
                            </div>

                            {/* Row 2: Phone & Company */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Phone Number *</span>
                                        <span style={{ 
                                            fontSize: '11px', 
                                            fontWeight: '600', 
                                            color: formData.phone.length === 10 ? '#10b981' : '#f59e0b',
                                            backgroundColor: formData.phone.length === 10 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px'
                                        }}>
                                            {formData.phone.length}/10 Digits
                                        </span>
                                    </label>
                                    <div className="phone-input-row">
                                        <input 
                                            type="tel" 
                                            name="phone" 
                                            required 
                                            inputMode="numeric"
                                            maxLength={10}
                                            pattern="[0-9]{10}"
                                            value={formData.phone} 
                                            onChange={(e) => { handleChange(e); setFindResult(null); }} 
                                            placeholder="Enter 10-digit mobile number"
                                            className="phone-number-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={findByPhone}
                                            disabled={formData.phone.length !== 10 || finding}
                                            className="btn btn-outline btn-phone-find"
                                            title="Search for existing visitor by this phone number"
                                        >
                                            {finding ? (
                                                <><i className="fa-solid fa-spinner fa-spin"></i> Finding...</>
                                            ) : (
                                                <><i className="fa-solid fa-magnifying-glass"></i> Find</>
                                            )}
                                        </button>
                                    </div>
                                    {formData.phone.length > 0 && formData.phone.length < 10 && (
                                        <span style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', display: 'block' }}>
                                            Must be exactly 10 digits ({10 - formData.phone.length} more needed)
                                        </span>
                                    )}
                                    {findResult === 'found' && (
                                        <span style={{ fontSize: '12px', color: '#10b981', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '600' }}>
                                            <i className="fa-solid fa-circle-check"></i> Visitor found! Details auto-filled from previous visit.
                                        </span>
                                    )}
                                    {findResult === 'not-found' && (
                                        <span style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '500' }}>
                                            <i className="fa-solid fa-circle-info"></i> No previous visit found. Please fill in the details.
                                        </span>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>Company Name</label>
                                    <input type="text" name="company" value={formData.company} onChange={handleChange} placeholder="Acme Corp (Optional)" />
                                </div>
                            </div>

                            {/* Row 3: ID Proof Dropdown & ID Number Column */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label>
                                        <i className="fa-solid fa-address-card" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                        ID Proof Type *
                                    </label>
                                    <select 
                                        name="idType" 
                                        required
                                        value={formData.idType} 
                                        onChange={handleChange}
                                        className="form-control"
                                    >
                                        <option value="">-- Select ID Proof Type * --</option>
                                        <option value="Aadhar Number">Aadhar Number (12 Digits)</option>
                                        <option value="PAN Number">PAN Number (10 Chars)</option>
                                        <option value="Driving License">Driving License</option>
                                        <option value="Passport">Passport (8 Chars)</option>
                                        <option value="Voter ID">Voter ID (10 Chars)</option>
                                        <option value="Company ID">Company ID</option>
                                        <option value="Other">Other Government ID</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>
                                            <i className="fa-solid fa-hashtag" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                            ID Number *
                                        </span>
                                        {formData.idType && idValidation.badgeText && (
                                            <span style={{ 
                                                fontSize: '11px', 
                                                fontWeight: '600', 
                                                color: idValidation.isValid ? '#10b981' : '#f59e0b',
                                                backgroundColor: idValidation.isValid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {idValidation.badgeText}
                                            </span>
                                        )}
                                    </label>
                                    <input 
                                        type="text" 
                                        name="idNumber" 
                                        required
                                        value={formData.idNumber} 
                                        onChange={handleChange} 
                                        maxLength={idValidation.maxLen || undefined}
                                        placeholder={
                                            formData.idType === 'Aadhar Number' ? 'Enter 12-digit Aadhar (e.g. 1234 5678 9012)' :
                                            formData.idType === 'PAN Number' ? 'Enter 10-char PAN (e.g. ABCDE1234F)' :
                                            formData.idType === 'Company ID' ? 'Enter Company EMP ID (e.g. EMP-9821)' :
                                            formData.idType === 'Driving License' ? 'Enter DL number (e.g. DL-1420110012345)' :
                                            formData.idType === 'Passport' ? 'Enter 8-char Passport (e.g. A1234567)' :
                                            formData.idType === 'Voter ID' ? 'Enter 10-char Voter ID (e.g. ABC1234567)' :
                                            (formData.idType ? 'Enter ID document number' : 'Select ID Type first')
                                        } 
                                    />
                                    {idValidation.errorHint && (
                                        <span style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', display: 'block' }}>
                                            {idValidation.errorHint}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Row 4: Vehicle Details (Placed immediately after ID Proof) */}
                            <div className="form-row form-row-vehicle">
                                <div className="form-group">
                                    <label>
                                        <i className="fa-solid fa-car" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                        Vehicle Coming? *
                                    </label>
                                    <select
                                        name="hasVehicle"
                                        value={formData.hasVehicle}
                                        onChange={handleChange}
                                        className="form-control"
                                    >
                                        <option value="no">No</option>
                                        <option value="yes">Yes</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>
                                        <i className="fa-solid fa-barcode" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                        Vehicle Number {formData.hasVehicle === 'yes' ? '*' : ''}
                                    </label>
                                    <input 
                                        type="text" 
                                        name="vehicleNo" 
                                        value={formData.vehicleNo} 
                                        onChange={handleChange} 
                                        disabled={formData.hasVehicle === 'no'}
                                        required={formData.hasVehicle === 'yes'}
                                        placeholder={formData.hasVehicle === 'yes' ? 'e.g. TN-01-AB-1234' : 'Disabled (No Vehicle)'}
                                        style={{
                                            backgroundColor: formData.hasVehicle === 'no' ? 'rgba(255, 255, 255, 0.05)' : 'inherit',
                                            cursor: formData.hasVehicle === 'no' ? 'not-allowed' : 'text',
                                            opacity: formData.hasVehicle === 'no' ? 0.65 : 1
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Row 5: Extra Accompanying Members */}
                            <div className={`form-row form-row-extra ${formData.hasExtraMembers === 'yes' ? 'has-extra' : ''}`}>
                                <div className="form-group">
                                    <label>
                                        <i className="fa-solid fa-users" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                        Extra Members? *
                                    </label>
                                    <select
                                        name="hasExtraMembers"
                                        value={formData.hasExtraMembers}
                                        onChange={handleChange}
                                        className="form-control"
                                    >
                                        <option value="no">No</option>
                                        <option value="yes">Yes</option>
                                    </select>
                                </div>

                                {formData.hasExtraMembers === 'yes' && (
                                    <>
                                        <div className="form-group">
                                            <label>
                                                <i className="fa-solid fa-hashtag" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                                No. of Members *
                                            </label>
                                            <input 
                                                type="number" 
                                                name="extraMembersCount" 
                                                min="1" 
                                                max="50"
                                                required 
                                                value={formData.extraMembersCount} 
                                                onChange={handleChange} 
                                                placeholder="e.g. 2" 
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>
                                                <i className="fa-solid fa-id-card-clip" style={{ marginRight: '6px', color: 'var(--accent-primary)' }}></i>
                                                Accompanying Visitor IDs *
                                            </label>
                                            <input 
                                                type="text" 
                                                name="extraMembersIds" 
                                                required 
                                                value={formData.extraMembersIds} 
                                                onChange={handleChange} 
                                                placeholder="e.g. VIS-1002, VIS-1003" 
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Host */}
                            <div className="form-group">
                                <label>Person to Meet / Host *</label>
                                <select 
                                    name="hostSelect" 
                                    required 
                                    value={OFFICE_HOSTS.some(h => h.name === formData.hostName) ? formData.hostName : (formData.hostName ? 'other' : '')} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'other') {
                                            setFormData(prev => ({ ...prev, hostName: '' }));
                                        } else {
                                            setFormData(prev => ({ ...prev, hostName: val }));
                                        }
                                    }}
                                    className="form-control"
                                >
                                    <option value="">-- Select Person to Meet --</option>
                                    {OFFICE_HOSTS.map(h => (
                                        <option key={h.name} value={h.name}>
                                            {h.name} {h.department ? `(${h.department})` : ''}
                                        </option>
                                    ))}
                                    <option value="other">Other (Type Custom Name)</option>
                                </select>
                                {(!OFFICE_HOSTS.some(h => h.name === formData.hostName) || formData.hostName === '') && (
                                    <input 
                                        type="text" 
                                        name="hostName" 
                                        required 
                                        value={formData.hostName} 
                                        onChange={handleChange} 
                                        placeholder="Type host or department name" 
                                        style={{ marginTop: '8px' }}
                                    />
                                )}
                            </div>

                            {/* Purpose */}
                            <div className="form-group full-width">
                                <label>Purpose of Visit *</label>
                                <input type="text" name="purpose" required value={formData.purpose} onChange={handleChange} placeholder="Meeting, Interview, Delivery, etc." />
                            </div>
                        </div>
                    </div>
                    
                    <div className="form-actions mt-4">
                        <button type="submit" className="btn btn-primary btn-action-submit" disabled={submitting}>
                            {submitting ? (
                                <>
                                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                                    Processing...
                                </>
                            ) : (
                                isKiosk ? 'Register & Get Check-In QR' : 'Register & Print Badge'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
}
