import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../db';
import './Scanner.css';

export default function QRScanner() {
    const navigate = useNavigate();
    const [scanStatus, setScanStatus] = useState('idle'); // idle, success-in, success-out, error
    const [message, setMessage] = useState('Position visitor QR code within the frame');
    const [visitorDetails, setVisitorDetails] = useState(null);
    const [isScanning, setIsScanning] = useState(true);

    const handleScan = useCallback(async (result) => {
        if (!result || !result[0]) return;
        const rawCode = result[0].rawValue;
        
        // Prevent rapid re-scanning
        if (!isScanning) return;
        setIsScanning(false);
        
        try {
            let visitorId = rawCode ? rawCode.trim() : '';
            let isExplicitCheckout = false;

            if (visitorId.includes('id=')) {
                try {
                    const parsedUrl = new URL(visitorId, window.location.origin);
                    const extractedId = parsedUrl.searchParams.get('id');
                    const action = parsedUrl.searchParams.get('action');
                    if (extractedId) visitorId = extractedId;
                    if (action === 'checkout') isExplicitCheckout = true;
                } catch (_e) {
                    const idMatch = visitorId.match(/[?&]id=([^&]+)/);
                    if (idMatch) visitorId = idMatch[1];
                    if (visitorId.includes('action=checkout')) isExplicitCheckout = true;
                }
            }

            // Find visitor
            const visitor = await db.visitors.get(visitorId);
            
            if (visitor) {
                setVisitorDetails(visitor);
                if (isExplicitCheckout || visitor.status === 'checked-in') {
                    // Check Out
                    const checkOutTime = new Date().toISOString();
                    await db.visitors.update(visitorId, {
                        status: 'checked-out',
                        checkOutTime
                    });
                    visitor.status = 'checked-out';
                    visitor.checkOutTime = checkOutTime;
                    
                    setScanStatus('success-out');
                    setMessage(`Checked OUT: ${visitor.name}`);
                    window.dispatchEvent(new CustomEvent('visitor-scan-processed', { 
                        detail: { visitor, action: 'checkout', timestamp: checkOutTime } 
                    }));
                    
                } else if (visitor.status === 'registered' || visitor.status === 'expected') {
                    // Check In
                    const checkInTime = new Date().toISOString();
                    await db.visitors.update(visitorId, {
                        status: 'checked-in',
                        checkInTime
                    });
                    visitor.status = 'checked-in';
                    visitor.checkInTime = checkInTime;
                    
                    setScanStatus('success-in');
                    setMessage(`Checked IN: ${visitor.name}`);
                    window.dispatchEvent(new CustomEvent('visitor-scan-processed', { 
                        detail: { visitor, action: 'checkin', timestamp: checkInTime } 
                    }));
                    
                } else if (visitor.status === 'checked-out') {
                    // Notice: Already checked out
                    setScanStatus('error');
                    setMessage(`Notice: Pass expired / already checked out (${visitor.name})`);
                    window.dispatchEvent(new CustomEvent('visitor-scan-processed', { 
                        detail: { visitor, action: 'already-checked-out', timestamp: visitor.checkOutTime } 
                    }));
                }
            } else {
                setScanStatus('error');
                setMessage(`Unknown Visitor ID: "${visitorId}"`);
            }
        } catch (err) {
            console.error("Scanner Error", err);
            setScanStatus('error');
            setMessage('Database error processing scan');
        }

        // Reset scanner after 3.5 seconds
        setTimeout(() => {
            setScanStatus('idle');
            setMessage('Position visitor QR code within the frame');
            setVisitorDetails(null);
            setIsScanning(true);
        }, 3500);
        
    }, [isScanning]);

    return (
        <section className="scanner-section">
            <div className="glass-panel scanner-container">
                <div className="scanner-header">
                    <h2>Auto Gate QR Scanner</h2>
                    <p>Hold visitor pass or mobile screen in front of the camera</p>
                </div>
                
                <div className={`scanner-viewport ${scanStatus}`}>
                    {isScanning ? (
                        <Scanner 
                            onScan={handleScan}
                            onError={(error) => console.log(error?.message)}
                            components={{
                                audio: false,
                                torch: false,
                                count: false,
                                onOff: false
                            }}
                            styles={{
                                container: { width: '100%', height: '100%' },
                                video: { objectFit: 'cover', width: '100%', height: '100%' }
                            }}
                        />
                    ) : (
                        <div className="scan-paused-placeholder">
                            <i className="fa-solid fa-spinner fa-spin"></i>
                        </div>
                    )}

                    {/* Viewfinder Target Frame Overlay */}
                    <div className="viewfinder-frame">
                        <span className="corner-top-left"></span>
                        <span className="corner-top-right"></span>
                        <span className="corner-bottom-left"></span>
                        <span className="corner-bottom-right"></span>
                        <div className="scan-laser-line"></div>
                    </div>

                    {scanStatus === 'success-in' && (
                        <div className="scan-result-overlay overlay-in">
                            <i className="fa-solid fa-circle-check"></i>
                        </div>
                    )}

                    {scanStatus === 'success-out' && (
                        <div className="scan-result-overlay overlay-out">
                            <i className="fa-solid fa-person-walking-arrow-right"></i>
                        </div>
                    )}

                    {scanStatus === 'error' && (
                        <div className="scan-result-overlay overlay-err">
                            <i className="fa-solid fa-circle-xmark"></i>
                        </div>
                    )}
                </div>

                <div className={`scanner-message status-${scanStatus}`}>
                    <i className={`fa-solid ${
                        scanStatus === 'success-in' ? 'fa-circle-check' :
                        scanStatus === 'success-out' ? 'fa-circle-check' :
                        scanStatus === 'error' ? 'fa-triangle-exclamation' : 'fa-camera'
                    }`}></i>
                    <span>{message}</span>
                </div>

                {visitorDetails && (
                    <div className="scanned-visitor-summary">
                        <strong>{visitorDetails.name}</strong> • Host: {visitorDetails.hostName} • ID: {visitorDetails.visitorNo || visitorDetails.id}
                    </div>
                )}

                <div className="scanner-actions">
                    <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate('/dashboard')}
                    >
                        <i className="fa-solid fa-chart-pie"></i>
                        <span>Dashboard</span>
                    </button>
                    <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate('/register')}
                    >
                        <i className="fa-solid fa-plus"></i>
                        <span>New Registration</span>
                    </button>
                </div>
            </div>
        </section>
    );
}
