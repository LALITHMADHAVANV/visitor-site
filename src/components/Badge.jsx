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
      padding: 0 !important;
      background: #ffffff !important;
    }
    .badge-thermal-slip {
      width: 76mm !important;
      max-width: 76mm !important;
      margin: 0 auto !important;
      padding: 3mm 2mm 5mm 2mm !important;
      border: none !important;
      box-shadow: none !important;
      background: #ffffff !important;
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

    // Date & Time formatting
    const rawTime = visitor.checkInTime || visitor.created_at || new Date();
    const dateObj = new Date(rawTime);
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

    const day = String(validDate.getDate()).padStart(2, '0');
    const month = String(validDate.getMonth() + 1).padStart(2, '0');
    const year = validDate.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

    const hours = validDate.getHours();
    const minutes = String(validDate.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = String(hours % 12 || 12).padStart(2, '0');
    const formattedInTime = `${hours12}:${minutes} ${ampm}`;



    // Total persons count
    const extraCount = visitor.hasExtraMembers === 'yes' ? (parseInt(visitor.extraMembersCount, 10) || 0) : 0;
    const totalPersons = 1 + extraCount;

    // Clean purpose from any tags
    const cleanPurpose = visitor.purpose 
        ? visitor.purpose
            .replace(/\[ID:.*?\]/g, '')
            .replace(/\[Vehicle:.*?\]/g, '')
            .replace(/\[Extra:.*?\]/g, '')
            .trim() || visitor.purpose
        : '-';

    const vehicleNo = visitor.vehicleNo && visitor.vehicleNo !== 'No' ? visitor.vehicleNo : '-';
    const unitName = visitor.unit || 'HEAD OFFICE';

    return (
        <div className="badge-print-container" ref={ref}>
            <div className="badge-thermal-slip">
                {/* 1. Header */}
                <div className="badge-company-header">
                    <h1 className="badge-company-title">ESS TEE EXPORTS PVT LTD</h1>
                    <h2 className="badge-pass-title">VISITOR PASS</h2>
                </div>

                {/* 2. Top Grid: Photo on Left, Large QR Code & Details on Right */}
                <div className="badge-top-grid">
                    <div className="badge-top-left">
                        <div className="badge-photo-wrapper">
                            {visitor.photoData ? (
                                <img 
                                    src={visitor.photoData} 
                                    alt="Visitor" 
                                    className="badge-visitor-photo" 
                                />
                            ) : (
                                <div className="badge-photo-placeholder">
                                    <i className="fa-solid fa-user"></i>
                                    <span>NO PHOTO</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="badge-top-right">
                        <div className="badge-qr-container">
                            <QRCodeSVG 
                                value={exitQrUrl} 
                                size={108} 
                                level="M" 
                                fgColor="#000000"
                                bgColor="#ffffff"
                            />
                        </div>
                        <div className="badge-pass-meta">
                            <div className="meta-line">
                                <span className="meta-label">Date :</span>
                                <span className="meta-val">{formattedDate}</span>
                            </div>
                            <div className="meta-line">
                                <span className="meta-label">In :</span>
                                <span className="meta-val">{formattedInTime}</span>
                            </div>
                            <div className="meta-line">
                                <span className="meta-label">Vehicle :</span>
                                <span className="meta-val">{vehicleNo.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Horizontal Divider Line */}
                <div className="badge-divider-line"></div>

                {/* 3. Visitor Details Section */}
                <div className="badge-visitor-info">
                    {/* Visitor Name (Large Bold Uppercase) */}
                    <div className="badge-visitor-name">
                        {(visitor.name || '').toUpperCase()}
                    </div>

                    {/* Company */}
                    <div className="badge-info-row">
                        <span className="info-label">Company :</span>
                        <span className="info-val">{(visitor.company || '-').toUpperCase()}</span>
                    </div>

                    {/* Persons Count (Prominent Bold) */}
                    <div className="badge-persons-row">
                        <span className="persons-label">PERSONS :</span>
                        <span className="persons-val">{totalPersons}</span>
                    </div>

                    {/* Host / To Meet */}
                    <div className="badge-info-row">
                        <span className="info-label">To Meet :</span>
                        <span className="info-val">{(visitor.hostName || visitor.hostname || '-').toUpperCase()}</span>
                    </div>

                    {/* Purpose */}
                    <div className="badge-info-row">
                        <span className="info-label">Purpose :</span>
                        <span className="info-val">{cleanPurpose.toUpperCase()}</span>
                    </div>

                    {/* Unit */}
                    <div className="badge-info-row badge-unit-row">
                        <span className="info-label bold-label">Unit :</span>
                        <span className="info-val bold-val">{unitName}</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Badge;
