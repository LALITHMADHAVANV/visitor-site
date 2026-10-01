const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { QRCodeSVG } = require('qrcode.react');

const ARTIFACT_DIR = 'C:\\Users\\lalit\\.gemini\\antigravity-ide\\brain\\bde6e5b2-c453-4dcb-a1d5-24a040032276';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const logoPath = path.join(PUBLIC_DIR, 'company-logo.png');
const logoBuffer = fs.readFileSync(logoPath);
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

const registrationUrl = 'https://visitor-site-texplus.vercel.app/kiosk';

// 1. Generate QR Code SVG with embedded logo
const qrElement = React.createElement(QRCodeSVG, {
    value: registrationUrl,
    size: 600,
    level: 'H', // High error correction
    marginSize: 3, // Quiet zone margin
    bgColor: '#FFFFFF',
    fgColor: '#0F172A', // Slate dark
    imageSettings: {
        src: logoBase64,
        height: 120,
        width: 120,
        excavate: true
    }
});

let svgMarkup = ReactDOMServer.renderToStaticMarkup(qrElement);

if (!svgMarkup.includes('xmlns=')) {
    svgMarkup = svgMarkup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ');
}

// Save SVG to public and artifacts
const publicSvgPath = path.join(PUBLIC_DIR, 'visitor-qr-code.svg');
const artifactSvgPath = path.join(ARTIFACT_DIR, 'visitor-qr-code.svg');

fs.writeFileSync(publicSvgPath, svgMarkup, 'utf8');
fs.writeFileSync(artifactSvgPath, svgMarkup, 'utf8');

console.log('Saved SVG to:', publicSvgPath);
console.log('Saved SVG to:', artifactSvgPath);
