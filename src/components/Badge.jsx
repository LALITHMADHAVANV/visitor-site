import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './Badge.css';

const Badge = React.forwardRef(({ visitor }, ref) => {
    if (!visitor) return null;

    const getCleanOrigin = () => {
        if (typeof window === 'undefined') return '';
        const origin = window.location.origin;
        if (origin && origin.includes('.vercel.app')) {
            return 'https://visitor-site-texplus.vercel.app';
        }
        return origin;
    };

    const cleanOrigin = getCleanOrigin();
    const exitQrUrl = `${cleanOrigin}/mobile-action?id=${visitor.id}&action=checkout`;

    const formattedDate = visitor.checkInTime 
        ? new Date(visitor.checkInTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="badge-print-container" ref={ref}>
            <div className="badge-card">
                <div className="badge-header">
                    <div className="badge-brand">
                        <i className="fa-solid fa-shield-halved"></i>
                        <span>VMS Pro</span>
                    </div>
                    <span className="badge-title">VISITOR PASS</span>
                </div>
                
                <div className="badge-body">
                    <div className="badge-photo-container">
                        {visitor.photoData ? (
                            <img src={visitor.photoData} alt="Visitor" className="badge-photo" />
                        ) : (
                            <div className="badge-photo-placeholder">
                                {visitor.name ? visitor.name.charAt(0).toUpperCase() : 'V'}
                            </div>
                        )}
                    </div>
                    
                    <div className="badge-details">
                        <h2 className="visitor-name" title={visitor.name}>{visitor.name}</h2>
                        {visitor.company && <p className="visitor-company" title={visitor.company}>{visitor.company}</p>}
                        
                        <div className="host-info">
                            <span className="label">Host:</span>
                            <span className="value">{visitor.hostName || '-'}</span>
                        </div>
                        
                        <div className="date-info">
                            <span className="label">Date:</span>
                            <span className="value">{formattedDate}</span>
                        </div>
                    </div>

                    <div className="badge-exit-qr">
                        <div className="badge-qr-box">
                            <QRCodeSVG 
                                value={exitQrUrl} 
                                size={54} 
                                level="M" 
                                fgColor="#000000"
                                bgColor="#ffffff"
                            />
                        </div>
                        <span className="badge-qr-tag">SCAN TO EXIT</span>
                    </div>
                </div>
                
                <div className="badge-footer">
                    <span className="badge-notice">Scan Exit QR on departure</span>
                    <span className="badge-id">{visitor.id}</span>
                </div>
            </div>
        </div>
    );
});

export default Badge;
