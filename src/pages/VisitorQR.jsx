import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';

export default function VisitorQR() {
    const printRef = useRef(null);
    const [copied, setCopied] = useState(false);

    const getKioskUrl = () => {
        const origin = window.location.origin;
        if (origin.includes('.vercel.app')) {
            return 'https://visitor-site-texplus.vercel.app/kiosk';
        }
        return `${origin}/kiosk`;
    };

    const kioskUrl = getKioskUrl();

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: 'Visitor_Self_Registration_QR_Standee',
    });

    const handleCopy = () => {
        navigator.clipboard.writeText(kioskUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <section className="view-section active">
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                {/* Printable Standee Card */}
                <div 
                    ref={printRef}
                    className="glass-panel" 
                    style={{ 
                        padding: '40px 32px', 
                        textAlign: 'center', 
                        borderRadius: '24px',
                        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        marginBottom: '24px'
                    }}
                >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(59, 130, 246, 0.12)', padding: '8px 20px', borderRadius: '30px', marginBottom: '20px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                        <i className="fa-solid fa-shield-halved" style={{ color: 'var(--accent-primary)', fontSize: '18px' }}></i>
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Visitor Self-Check In
                        </span>
                    </div>

                    <h1 style={{ fontSize: '28px', color: 'white', marginBottom: '8px', fontWeight: '700' }}>
                        Welcome to Our Office
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '15px', maxWidth: '440px', margin: '0 auto 28px auto', lineHeight: '1.5' }}>
                        Please scan the QR code with your smartphone camera to register your visit.
                    </p>

                    {/* QR Code Container */}
                    <div style={{ 
                        background: '#ffffff', 
                        padding: '24px', 
                        borderRadius: '20px', 
                        display: 'inline-block',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                        marginBottom: '20px'
                    }}>
                        <QRCodeSVG 
                            value={kioskUrl} 
                            size={240} 
                            level="H"
                            includeMargin={false}
                        />
                    </div>

                    <p style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '13px', 
                        color: 'var(--accent-primary)', 
                        background: 'rgba(59, 130, 246, 0.08)',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        display: 'inline-block',
                        margin: '0 auto 28px auto',
                        wordBreak: 'break-all'
                    }}>
                        {kioskUrl}
                    </p>

                    {/* Quick Steps Guide */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: '16px', 
                        textAlign: 'center',
                        padding: '20px 12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.06)'
                    }}>
                        <div>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px auto', fontWeight: 'bold' }}>
                                1
                            </div>
                            <div style={{ fontSize: '13px', color: 'white', fontWeight: '600' }}>Scan QR</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>With phone camera</div>
                        </div>

                        <div>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px auto', fontWeight: 'bold' }}>
                                2
                            </div>
                            <div style={{ fontSize: '13px', color: 'white', fontWeight: '600' }}>Enter Details</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Name, host & photo</div>
                        </div>

                        <div>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px auto', fontWeight: 'bold' }}>
                                3
                            </div>
                            <div style={{ fontSize: '13px', color: 'white', fontWeight: '600' }}>Get Pass</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Host gets notified</div>
                        </div>
                    </div>
                </div>

                {/* Control Action Buttons (Hidden when printing) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <button 
                        type="button" 
                        className="btn btn-primary"
                        onClick={handlePrint}
                        style={{ padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
                    >
                        <i className="fa-solid fa-print"></i>
                        Print Standee
                    </button>

                    <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={() => window.open(kioskUrl, '_blank')}
                        style={{ padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
                    >
                        <i className="fa-solid fa-external-link"></i>
                        Test Kiosk Page
                    </button>

                    <button 
                        type="button" 
                        className="btn btn-outline"
                        onClick={handleCopy}
                        style={{ padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
                    >
                        <i className={copied ? "fa-solid fa-check text-success" : "fa-regular fa-copy"}></i>
                        {copied ? "Link Copied!" : "Copy URL"}
                    </button>
                </div>
            </div>
        </section>
    );
}
