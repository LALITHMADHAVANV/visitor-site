import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './Badge.css';

// Optimized for standard 80mm (3-inch) Thermal Bill / Receipt Printers (e.g. TVS RP 3230)
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
      width: 80mm !important;
      background: #ffffff !important;
    }
    .badge-print-container {
      display: block !important;
      position: relative !important;
      width: 80mm !important;
      margin: 0 auto !important;
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

// Backward compatibility alias
export const THERMAL_58MM_PAGE_STYLE = THERMAL_80MM_PAGE_STYLE;

// Custom hook to enhance face photo for thermal receipt printing
// Lifts dark indoor shadows via gamma correction so the face doesn't burn into a black blob
function useEnhancedThermalPhoto(src) {
    const [enhancedSrc, setEnhancedSrc] = useState(src);

    useEffect(() => {
        if (!src) {
            setEnhancedSrc(null);
            return;
        }

        let isMounted = true;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (!isMounted) return;
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const w = img.width || 320;
                const h = img.height || 240;
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);

                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;

                // 1. Calculate luminance per pixel
                // 2. Lift shadows gently via gamma (gamma = 1.35) so faces don't black out on thermal heads
                // 3. Gentle contrast boost to keep eyes, eyebrows, and contours crisp
                for (let i = 0; i < d.length; i += 4) {
                    const r = d[i];
                    const g = d[i + 1];
                    const b = d[i + 2];
                    // Perceptual grayscale (ITU-R BT.709)
                    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                    // Normalize to 0..1
                    const norm = gray / 255;

                    // Gamma curve to elevate deep shadows (prevents thermal head burn-in)
                    const gammaLifted = Math.pow(norm, 1 / 1.35);

                    // Gentle S-curve contrast (pivot around 0.5)
                    let adjusted = (gammaLifted - 0.5) * 1.12 + 0.5;
                    adjusted = Math.min(1, Math.max(0, adjusted));

                    const finalVal = Math.round(adjusted * 255);
                    d[i] = finalVal;
                    d[i + 1] = finalVal;
                    d[i + 2] = finalVal;
                }

                ctx.putImageData(imgData, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                setEnhancedSrc(dataUrl);
            } catch (err) {
                console.warn('Thermal photo enhancement fallback:', err);
                setEnhancedSrc(src);
            }
        };
        img.onerror = () => {
            if (isMounted) setEnhancedSrc(src);
        };
        img.src = src;

        return () => {
            isMounted = false;
        };
    }, [src]);

    return enhancedSrc || src;
}

const Badge = React.forwardRef(({ visitor }, ref) => {
    if (!visitor) return null;

    const rawPhoto = visitor.photoData || visitor.photo || visitor.photoUrl;
    const enhancedPhoto = useEnhancedThermalPhoto(rawPhoto);

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
                {/* 1. Company Name on Top */}
                <div className="badge-company-header">
                    <h1 className="badge-company-title">ESS TEE EXPORTS PVT LTD</h1>
                    <h2 className="badge-pass-title">VISITOR PASS</h2>
                </div>

                {/* 2. Side-by-Side: Left Photo, Right QR Code with Date & In Time Below QR */}
                <div className="badge-side-by-side">
                    {/* Left: Visitor Photo (Enhanced for thermal clarity) */}
                    <div className="badge-left-photo-col">
                        <div className="badge-photo-wrapper">
                            {enhancedPhoto ? (
                                <img 
                                    src={enhancedPhoto} 
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

                    {/* Right: QR Code + Date & In Time directly below QR */}
                    <div className="badge-right-qr-col">
                        <div className="badge-qr-container">
                            <QRCodeSVG 
                                value={exitQrUrl} 
                                size={110} 
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

                {/* 3. Down: Other Details */}
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
