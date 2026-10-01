import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './Badge.css';

export const THERMAL_80MM_PAGE_STYLE = `
  @page {
    size: 80mm auto;
    margin: 0mm !important;
  }
  @media print {
    *, *:before, *:after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background: #ffffff !important;
    }
    .badge-print-container {
      display: block !important;
      position: relative !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 0 5mm 0 !important;
      background: #ffffff !important;
    }
    .badge-card-80mm {
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      border: 2px solid #000000 !important;
      border-radius: 0px !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      page-break-after: always;
      break-after: page;
    }
  }
`;

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

    // Extract Vehicle No
    const rawVehicleNo = visitor.vehicleNo || (() => {
        if (visitor.purpose) {
            const match = visitor.purpose.match(/\[Vehicle:\s*(.*?)\]/i);
            if (match && match[1]) return match[1].trim();
        }
        return visitor.hasVehicle === 'yes' ? 'Yes' : (visitor.vehicleNo || 'No');
    })();
    const displayVehicleNo = rawVehicleNo || 'No';

    // Extract ID Details
    const rawIdType = visitor.idType || (() => {
        if (visitor.purpose) {
            const match = visitor.purpose.match(/\[ID:\s*(.*?)(?:\s*-\s*(.*?))?\]/i);
            if (match && match[1]) return match[1].trim();
        }
        return null;
    })();
    const rawIdNumber = visitor.idNumber || (() => {
        if (visitor.purpose) {
            const match = visitor.purpose.match(/\[ID:\s*.*?\s*-\s*(.*?)\]/i);
            if (match && match[1]) return match[1].trim();
        }
        return null;
    })();

    // Extra Members
    const extraCount = visitor.hasExtraMembers === 'yes' ? (parseInt(visitor.extraMembersCount) || 1) : 0;
    const extraIds = visitor.extraMembersIds || '';

    // Clean purpose from any embedded tags
    const cleanPurpose = visitor.purpose 
        ? visitor.purpose
            .replace(/\[ID:.*?\]/g, '')
            .replace(/\[Vehicle:.*?\]/g, '')
            .replace(/\[Extra:.*?\]/g, '')
            .trim() || visitor.purpose
        : '-';

    const logoSrc = (typeof window !== 'undefined' && localStorage.getItem('companyLogo')) || '/company-logo.png';
    const passNo = visitor.visitorNo || visitor.id || '';

    return (
        <div className="badge-print-container" ref={ref}>
            <div className="badge-card-80mm">
                {/* Header Title Band */}
                <div className="badge-header-band">VISITOR PASS</div>

                <div className="badge-main-body">
                    {/* Left Section: Company Logo + Exit QR */}
                    <div className="badge-left-col">
                        <div className="badge-company-logo-area">
                            <img 
                                src={logoSrc} 
                                alt="Esstee Exports" 
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
                                <span>Esstee Exports</span>
                            </div>
                        </div>

                        <div className="badge-exit-qr">
                            <div className="badge-qr-box">
                                <QRCodeSVG 
                                    value={exitQrUrl} 
                                    size={96} 
                                    level="H" 
                                    fgColor="#000000"
                                    bgColor="#ffffff"
                                    imageSettings={{
                                        src: logoSrc,
                                        height: 26,
                                        width: 26,
                                        excavate: true
                                    }}
                                />
                            </div>
                            <div className="badge-qr-meta">
                                <span className="badge-qr-label">EXIT QR</span>
                                {passNo && <span className="badge-qr-id">#{passNo}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Right Section: Name, Company, Visiting Person, Vehicle No, ID, Purpose, Time & Date */}
                    <div className="badge-right-col">
                        <div className="badge-field-row">
                            <span className="badge-field-label">Name:</span>
                            <span className="badge-field-val badge-name-val" title={visitor.name}>
                                {visitor.name || '-'}
                            </span>
                        </div>

                        {visitor.phone && (
                            <div className="badge-field-row">
                                <span className="badge-field-label">Phone:</span>
                                <span className="badge-field-val badge-mono-val">{visitor.phone}</span>
                            </div>
                        )}

                        <div className="badge-field-row">
                            <span className="badge-field-label">Company:</span>
                            <span className="badge-field-val" title={visitor.company}>
                                {visitor.company || '-'}
                            </span>
                        </div>

                        <div className="badge-field-row">
                            <span className="badge-field-label">Visiting Person:</span>
                            <span className="badge-field-val badge-bold-val" title={visitor.hostName || visitor.hostname}>
                                {visitor.hostName || visitor.hostname || '-'}
                            </span>
                        </div>

                        <div className="badge-field-row">
                            <span className="badge-field-label">Vehicle No:</span>
                            <span className="badge-field-val badge-vehicle-val" title={displayVehicleNo}>
                                {displayVehicleNo}
                            </span>
                        </div>

                        {rawIdType && (
                            <div className="badge-field-row">
                                <span className="badge-field-label">{rawIdType}:</span>
                                <span className="badge-field-val badge-mono-val">{rawIdNumber || 'Verified'}</span>
                            </div>
                        )}

                        {extraCount > 0 && (
                            <div className="badge-field-row">
                                <span className="badge-field-label">Extra:</span>
                                <span className="badge-field-val">+{extraCount} ({extraIds || 'Verified'})</span>
                            </div>
                        )}

                        <div className="badge-field-row">
                            <span className="badge-field-label">Purpose:</span>
                            <span className="badge-field-val" title={cleanPurpose}>
                                {cleanPurpose || '-'}
                            </span>
                        </div>

                        <div className="badge-field-row">
                            <span className="badge-field-label">Time & Date:</span>
                            <span className="badge-field-val badge-date-val">
                                {formattedDateTime}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Badge;
