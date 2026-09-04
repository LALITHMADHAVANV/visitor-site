export const OFFICE_HOSTS = [
    { name: 'HARI RAGAVAN', chatId: '8238405249', department: 'ENGINEERING' },
    { name: 'LALITH', chatId: '8853985508', department: 'ADMINISTRATION' },
    { name: 'RAMRAJ', chatId: '5130860318', department: 'OFFICE' }
];

export const getHostChatId = (hostName) => {
    if (!hostName) return null;
    const clean = hostName.trim().toLowerCase();
    const match = OFFICE_HOSTS.find(h => 
        h.name.toLowerCase() === clean ||
        clean.includes(h.name.toLowerCase()) ||
        h.name.toLowerCase().includes(clean)
    );
    return match ? match.chatId : null;
};
