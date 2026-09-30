import { supabase } from './supabaseClient';

export const OFFICE_HOSTS = [
    { name: 'HARI RAGAVAN', department: 'ENGINEERING' },
    { name: 'LALITH', department: 'ADMINISTRATION' },
    { name: 'RAMRAJ', department: 'OFFICE' }
];

export const getHostChatId = async (hostName) => {
    if (!hostName) return null;
    const clean = hostName.trim().toUpperCase();
    try {
        const { data, error } = await supabase
            .from('hosts')
            .select('chat_id')
            .ilike('name', clean)
            .single();
        if (error || !data) return null;
        return data.chat_id;
    } catch (e) {
        console.error('Error fetching host chat_id from DB:', e);
        return null;
    }
};
