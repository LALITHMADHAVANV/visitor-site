import React, { useState, useEffect, useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../db';
import './Scanner.css';

export default function QRScanner() {
    const [scanResult, setScanResult] = useState(null);
    const [scanStatus, setScanStatus] = useState('idle'); // idle, success-in, success-out, error
    const [message, setMessage] = useState('Point camera at Visitor QR Code');
    const [isScanning, setIsScanning] = useState(true);

    const handleScan = useCallback(async (result) => {
        if (!result || !result[0]) return;
        const qrCode = result[0].rawValue;
        
        // Prevent rapid re-scanning
        if (!isScanning) return;
        setIsScanning(false);
        
        try {
            // Find visitor
            const visitor = await db.visitors.get({ id: qrCode });
            
            if (visitor) {
                if (visitor.status === 'registered' || visitor.status === 'expected') {
                    // Check In
                    await db.visitors.update(qrCode, {
                        status: 'checked-in',
                        checkInTime: new Date().toISOString()
                    });
                    
                    setScanStatus('success-in');
                    setMessage(`Checked IN: ${visitor.name}`);
                    
                } else if (visitor.status === 'checked-in') {
                    // Check Out
                    await db.visitors.update(qrCode, {
                        status: 'checked-out',
                        checkOutTime: new Date().toISOString()
                    });
                    
                    setScanStatus('success-out');
                    setMessage(`Checked OUT: ${visitor.name}`);
                    
                } else if (visitor.status === 'checked-out') {
                    // Error: Already left
                    setScanStatus('error');
                    setMessage(`Error: Pass expired for ${visitor.name}`);
                }
            } else {
                setScanStatus('error');
                setMessage(`Error: Unknown Visitor ID (${qrCode})`);
            }
        } catch (err) {
            console.error("Scanner Error", err);
            setScanStatus('error');
            setMessage('Database Error');
        }

        // Reset scanner after 3 seconds
        setTimeout(() => {
            setScanStatus('idle');
            setMessage('Point camera at Visitor QR Code');
            setIsScanning(true);
        }, 3000);
        
    }, [isScanning]);

    return (
        <section className="view-section active scanner-section">
            <div className="glass-panel scanner-container">
                <div className="scanner-header">
                    <h2>Auto Check-In / Check-Out</h2>
                    <p>Security QR Scanner</p>
                </div>
                
                <div className={`scanner-viewport ${scanStatus}`}>
                    {isScanning ? (
                        <Scanner 
                            onScan={handleScan}
                            onError={(error) => console.log(error?.message)}
                            components={{
                                audio: false, // We will just use visual cues
                                onOff: true,
                                finder: true,
                            }}
                            styles={{
                                container: { width: '100%', height: '100%' }
                            }}
                        />
                    ) : (
                        <div className="scan-result-overlay">
                            {scanStatus === 'success-in' && <i className="fa-solid fa-arrow-right-to-bracket text-success"></i>}
                            {scanStatus === 'success-out' && <i className="fa-solid fa-person-walking-arrow-right text-primary"></i>}
                            {scanStatus === 'error' && <i className="fa-solid fa-circle-xmark text-danger"></i>}
                        </div>
                    )}
                </div>
                
                <div className={`scanner-message status-${scanStatus}`}>
                    {message}
                </div>
            </div>
        </section>
    );
}
