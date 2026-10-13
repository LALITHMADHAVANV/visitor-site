// Dynamic Host Management - loaded from and saved to MongoDB
export let OFFICE_HOSTS = [];

export const fetchHosts = async () => {
    try {
        const res = await fetch('/api/hosts');
        if (!res.ok) return [];
        const data = await res.json();
        OFFICE_HOSTS = Array.isArray(data) ? data : [];
        return OFFICE_HOSTS;
    } catch (e) {
        console.error('Error fetching hosts from API:', e);
        return [];
    }
};

export const saveHost = async (hostName, department = '') => {
    if (!hostName || !hostName.trim()) return null;
    const clean = hostName.trim().toUpperCase();
    try {
        const res = await fetch('/api/hosts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: clean, department: department.trim() })
        });
        if (!res.ok) return null;
        const saved = await res.json();
        // Update local cache
        const exists = OFFICE_HOSTS.some(h => (h.name || '').toUpperCase() === clean);
        if (!exists) {
            OFFICE_HOSTS.push(saved);
        }
        return saved;
    } catch (e) {
        console.error('Error saving host to MongoDB:', e);
        return null;
    }
};

export const getHostChatId = async (hostName) => {
    if (!hostName) return null;
    const clean = hostName.trim().toUpperCase();
    try {
        const res = await fetch(`/api/hosts?name=${encodeURIComponent(clean)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.chat_id || null;
    } catch (e) {
        console.error('Error fetching host chat_id from MongoDB:', e);
        return null;
    }
};
