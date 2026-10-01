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

    // Format Time & Date
    const rawTime = visitor.checkInTime || visitor.created_at || new Date();
    const dateObj = new Date(rawTime);
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

    const formattedTime = validDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });

    const formattedDate = validDate.toLocaleDateString([], { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
    });

    const formattedDateTime = `${formattedTime}, ${formattedDate}`;

    // Clean purpose from any embedded [ID: ...] tags
    const cleanPurpose = visitor.purpose 
        ? visitor.purpose.replace(/\[ID:.*?\]/g, '').trim() || visitor.purpose
        : '-';

    const logoSrc = (typeof window !== 'undefined' && localStorage.getItem('companyLogo')) || '/company-logo.png';
    const passNo = visitor.visitorNo || visitor.id || '';

    return (
        <div className="badge-print-container" ref={ref}>
            <div className="badge-card">
                {/* Left Section: Company Logo + Exit QR */}
                <div className="badge-left-col">
                    <div className="badge-company-logo-area">
                        <img 
                            src={logoSrc} 
                            alt="Company Logo" 
                            className="badge-logo-img"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextSibling) {
                                    e.currentTarget.nextSibling.style.display = 'flex';
                                }
                            }}
                        />
                        <div className="badge-logo-fallback" style={{ display: 'none' }}>
                            <i className="fa-solid fa-building-shield"></i>
                            <span>ess ee</span>
                        </div>
                    </div>

                    <div className="badge-exit-qr">
                        <div className="badge-qr-box">
                            <QRCodeSVG 
                                value={exitQrUrl} 
                                size={64} 
                                level="M" 
                                fgColor="#000000"
                                bgColor="#ffffff"
                            />
                        </div>
                        <div className="badge-qr-meta">
                            <span className="badge-qr-label">EXIT QR</span>
                            {passNo && <span className="badge-qr-id">#{passNo}</span>}
                        </div>
                    </div>
                </div>

                {/* Right Section: Name, Company, Visiting Person, Purpose, Time & Date */}
                <div className="badge-right-col">
                    <div className="badge-field-row">
                        <span className="badge-field-label">Name</span>
                        <span className="badge-field-sep">:</span>
                        <span className="badge-field-val badge-name-val" title={visitor.name}>
                            {visitor.name || '-'}
                        </span>
                    </div>

                    <div className="badge-field-row">
                        <span className="badge-field-label">Company</span>
                        <span className="badge-field-sep">:</span>
                        <span className="badge-field-val" title={visitor.company}>
                            {visitor.company || '-'}
                        </span>
                    </div>

                    <div className="badge-field-row">
                        <span className="badge-field-label">Visiting Person</span>
                        <span className="badge-field-sep">:</span>
                        <span className="badge-field-val" title={visitor.hostName || visitor.hostname}>
                            {visitor.hostName || visitor.hostname || '-'}
                        </span>
                    </div>

                    <div className="badge-field-row">
                        <span className="badge-field-label">Purpose</span>
                        <span className="badge-field-sep">:</span>
                        <span className="badge-field-val" title={cleanPurpose}>
                            {cleanPurpose || '-'}
                        </span>
                    </div>

                    <div className="badge-field-row">
                        <span className="badge-field-label">Time & Date</span>
                        <span className="badge-field-sep">:</span>
                        <span className="badge-field-val">
                            {formattedDateTime}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Badge;
