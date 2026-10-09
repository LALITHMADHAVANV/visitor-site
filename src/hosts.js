export const OFFICE_HOSTS = [
    { name: 'HARI RAGAVAN', department: 'ENGINEERING' },
    { name: 'LALITH', department: 'ADMINISTRATION' },
    { name: 'RAMRAJ', department: 'OFFICE' }
];

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
