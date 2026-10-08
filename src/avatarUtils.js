const avatarCache = new Map();

/**
 * Generates an avatar image data URL (PNG) based on a person's name.
 * Extracts clean initials and draws them on an aesthetically pleasing gradient canvas.
 */
export function generateNameAvatar(name, size = 128) {
    if (typeof document === 'undefined') return null;

    const rawName = (name || '').trim();
    const cleanName = rawName.replace(/\[.*?\]/g, '').trim() || 'Visitor';
    const cacheKey = `${cleanName}_${size}`;

    if (avatarCache.has(cacheKey)) {
        return avatarCache.get(cacheKey);
    }

    // Extract initials: e.g. "John Doe" -> "JD", "Alex" -> "AL", "Suresh Kumar S" -> "SK"
    const parts = cleanName.split(/\s+/).filter(Boolean);
    let initials = 'V';
    if (parts.length === 1) {
        initials = parts[0].slice(0, 2).toUpperCase();
    } else if (parts.length >= 2) {
        initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    // Curated harmonious color palettes (primary + secondary for subtle gradients)
    const colorPalettes = [
        ['#2563eb', '#1d4ed8'], // Royal Blue
        ['#0d9488', '#0f766e'], // Deep Teal
        ['#7c3aed', '#6d28d9'], // Vivid Purple
        ['#ea580c', '#c2410c'], // Warm Amber / Orange
        ['#0284c7', '#0369a1'], // Ocean Cyan
        ['#059669', '#047857'], // Emerald
        ['#e11d48', '#be123c'], // Crimson Rose
        ['#4f46e5', '#4338ca'], // Indigo
        ['#475569', '#334155'], // Slate Modern
        ['#b45309', '#92400e'], // Bronze Gold
    ];

    // Compute stable hash from name string
    let hash = 0;
    for (let i = 0; i < cleanName.length; i++) {
        hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const paletteIndex = Math.abs(hash) % colorPalettes.length;
    const [c1, c2] = colorPalettes[paletteIndex];

    try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Background: Soft angle linear gradient
        const gradient = ctx.createLinearGradient(0, 0, size, size);
        gradient.addColorStop(0, c1);
        gradient.addColorStop(1, c2);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        // Subtle geometric background watermark (inner soft glow circle)
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fill();
        ctx.lineWidth = Math.max(1, Math.round(size * 0.03));
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.stroke();
        ctx.restore();

        // Draw Initials
        const fontSize = Math.round(size * (initials.length > 2 ? 0.35 : 0.42));
        ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Subtle drop shadow for crisp readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = Math.round(size * 0.04);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.round(size * 0.02);

        ctx.fillStyle = '#ffffff';
        // Center text visually
        ctx.fillText(initials, size / 2, size / 2 + Math.round(size * 0.02));

        // Export as lightweight JPEG (~2.5KB) instead of heavy PNG (~95KB)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        avatarCache.set(cacheKey, dataUrl);
        return dataUrl;
    } catch (e) {
        console.warn('Failed to generate avatar canvas:', e);
        return null;
    }
}

/**
 * Returns either the visitor's existing photo or generates a name-based avatar if none exists.
 */
export function getVisitorPhoto(visitor, size = 256) {
    if (!visitor) return null;
    const photo = visitor.photoData || visitor.photo_data || visitor.photo || visitor.photoUrl;
    if (photo && typeof photo === 'string' && photo.trim().length > 0 && !photo.includes('null')) {
        return photo;
    }
    return generateNameAvatar(visitor.name || visitor.visitorNo || visitor.id || 'Visitor', size);
}
