import React, { useEffect, useState, useRef } from 'react';
import { db } from '../db';
import { sendTelegramMessage } from '../telegram';
import './HardwareScannerListener.css';

// Audio feedback using Web Audio API
function playChime(type = 'in') {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'in') {
            // Ascending cheerful chime for check-in
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(783.99, now + 0.08); // G5
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'out') {
            // Smooth two-tone chime for check-out
            osc.frequency.setValueAtTime(659.25, now); // E5
            osc.frequency.setValueAtTime(440.00, now + 0.09); // A4
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else {
            // Alert buzzer for error
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    } catch (_e) {
        // Audio error ignored if user hasn't interacted with page yet
    }
}

export default function HardwareScannerListener() {
    const [scanAlert, setScanAlert] = useState(null); // { type: 'success-in' | 'success-out' | 'error', title, subtitle, visitor }
    const bufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);
    const alertTimeoutRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = async (e) => {
            const now = Date.now();
            const timeDiff = now - lastKeyTimeRef.current;
            lastKeyTimeRef.current = now;

            // Barcode scanners type very rapidly (typically < 45ms per character)
            // If the delay is long (> 300ms), start a fresh buffer unless it's Enter
            if (timeDiff > 350 && e.key !== 'Enter') {
                bufferRef.current = '';
            }

            if (e.key === 'Enter') {
                const scannedString = bufferRef.current.trim();
                bufferRef.current = '';

                // Minimum barcode length (at least 3 characters)
                if (scannedString.length >= 3) {
                    // Prevent form submission if an active input had focus during scan
                    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                        // If it looked like a full QR/URL or ID scan, blur the field so it doesn't pollute form
                        if (scannedString.includes('http') || scannedString.includes('id=') || scannedString.startsWith('VIS-')) {
                            e.preventDefault();
                            e.target.blur();
                        }
                    }

                    await processHardwareScan(scannedString);
                }
            } else if (e.key.length === 1) {
                // Collect printable characters
                bufferRef.current += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    const processHardwareScan = async (rawCode) => {
        try {
            let visitorId = rawCode.trim();
            let isExplicitCheckout = false;

            // Handle URL scans: e.g. https://.../mobile-action?id=VIS-1001&action=checkout
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

            // Find visitor in database by id or visitorNo
            let visitor = await db.visitors.get(visitorId);
            if (!visitor) {
                visitor = await db.visitors.where('visitorNo').equals(visitorId).first();
            }

            if (visitor) {
                if (isExplicitCheckout || visitor.status === 'checked-in') {
                    // Process Check Out
                    const checkOutTime = new Date().toISOString();
                    await db.visitors.update(visitor.id, {
                        status: 'checked-out',
                        checkOutTime
                    });

                    visitor.status = 'checked-out';
                    visitor.checkOutTime = checkOutTime;

                    playChime('out');
                    showAlert({
                        type: 'success-out',
                        title: 'Visitor Checked Out',
                        subtitle: `${visitor.name} (${visitor.visitorNo || visitor.id})`,
                        visitor
                    });
                } else if (visitor.status === 'registered' || visitor.status === 'expected') {
                    // Process Check In
                    const checkInTime = new Date().toISOString();
                    await db.visitors.update(visitor.id, {
                        status: 'checked-in',
                        checkInTime
                    });

                    visitor.status = 'checked-in';
                    visitor.checkInTime = checkInTime;

                    // Send Telegram alert if host has username
                    sendTelegramMessage(visitor).catch(() => {});

                    playChime('in');
                    showAlert({
                        type: 'success-in',
                        title: 'Visitor Checked In',
                        subtitle: `${visitor.name} (${visitor.visitorNo || visitor.id})`,
                        visitor
                    });
                } else if (visitor.status === 'checked-out') {
                    playChime('error');
                    showAlert({
                        type: 'warning',
                        title: 'Pass Already Checked Out',
                        subtitle: `${visitor.name} left at ${new Date(visitor.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        visitor
                    });
                }

                // Notify any open views/dashboards to re-fetch
                window.dispatchEvent(new CustomEvent('visitor-scan-processed', { detail: { visitor } }));
            } else {
                playChime('error');
                showAlert({
                    type: 'error',
                    title: 'Unknown Visitor ID',
                    subtitle: `No visitor record matching: "${visitorId}"`,
                    visitor: null
                });
            }
        } catch (err) {
            console.error("Hardware scan processing error:", err);
            playChime('error');
            showAlert({
                type: 'error',
                title: 'Scan Error',
                subtitle: 'Database error processing QR scan',
                visitor: null
            });
        }
    };

    const showAlert = (alertData) => {
        if (alertTimeoutRef.current) {
            clearTimeout(alertTimeoutRef.current);
        }
        setScanAlert(alertData);
        alertTimeoutRef.current = setTimeout(() => {
            setScanAlert(null);
        }, 4000);
    };

    if (!scanAlert) return null;

    return (
        <div className={`hardware-scan-banner banner-${scanAlert.type}`}>
            <div className="banner-icon">
                <i className={`fa-solid ${
                    scanAlert.type === 'success-in' ? 'fa-circle-check' :
                    scanAlert.type === 'success-out' ? 'fa-arrow-right-from-bracket' :
                    scanAlert.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-xmark'
                }`}></i>
            </div>
            <div className="banner-content">
                <div className="banner-title">{scanAlert.title}</div>
                <div className="banner-subtitle">{scanAlert.subtitle}</div>
                {scanAlert.visitor?.hostName && (
                    <div className="banner-meta">Host: {scanAlert.visitor.hostName} • Company: {scanAlert.visitor.company || 'N/A'}</div>
                )}
            </div>
            <button className="banner-close" onClick={() => setScanAlert(null)}>
                <i className="fa-solid fa-xmark"></i>
            </button>
        </div>
    );
}
