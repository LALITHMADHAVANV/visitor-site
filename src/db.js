import { supabase } from './supabaseClient';
import { generateNameAvatar } from './avatarUtils';

function normalizeVisitor(v) {
    if (!v) return v;
    if (v.hostname !== undefined && v.hostName === undefined) {
        v.hostName = v.hostname;
    }
    if (!v.visitorNo) {
        v.visitorNo = v.id;
    }
    if (v.photo_data && !v.photoData) {
        v.photoData = v.photo_data;
    }
    if (v.photo && !v.photoData) {
        v.photoData = v.photo;
    }
    if (!v.photoData && (v.name || v.visitorNo || v.id)) {
        v.photoData = generateNameAvatar(v.name || v.visitorNo || v.id);
    }
    // If idType / idNumber is not in columns, extract from purpose tag [ID: Type - Number]
    if ((!v.idType || !v.idNumber) && v.purpose && v.purpose.includes('[ID:')) {
        const match = v.purpose.match(/\[ID:\s*([^\]\-]+?)(?:\s*-\s*([^\]]+))?\]/);
        if (match) {
            if (!v.idType) v.idType = match[1].trim();
            if (!v.idNumber && match[2]) v.idNumber = match[2].trim();
        }
    }
    // If vehicleNo is not in columns, extract from purpose tag [Vehicle: ...]
    if (!v.vehicleNo && v.purpose && v.purpose.includes('[Vehicle:')) {
        const match = v.purpose.match(/\[Vehicle:\s*([^\]]+)\]/);
        if (match) {
            v.vehicleNo = match[1].trim();
            v.hasVehicle = v.vehicleNo.toLowerCase() === 'no' ? 'no' : 'yes';
        }
    }
    // If extra members not in columns, extract from purpose tag [Extra: ...]
    if (!v.extraMembersIds && v.purpose && v.purpose.includes('[Extra:')) {
        const match = v.purpose.match(/\[Extra:\s*(\d+)\s*Members?\s*(?:\(([^\]]+)\))?\]/);
        if (match) {
            v.hasExtraMembers = 'yes';
            v.extraMembersCount = parseInt(match[1]) || 0;
            v.extraMembersIds = match[2] ? match[2].trim() : '';
        }
    }
    return v;
}

export const db = {
    visitors: {
        async add(visitor) {
            let { data, error } = await supabase.from('visitors').insert([visitor]).select();
            if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('hostName'))) {
                const fallbackVisitor = { ...visitor };
                if (fallbackVisitor.hostName && error.message?.includes('hostName')) {
                    fallbackVisitor.hostname = fallbackVisitor.hostName;
                    delete fallbackVisitor.hostName;
                }
                
                // Embed ID tag
                const idTag = visitor.idType ? `[ID: ${visitor.idType}${visitor.idNumber ? ` - ${visitor.idNumber}` : ''}]` : '';
                // Embed Vehicle tag
                const vehicleTag = visitor.vehicleNo && visitor.vehicleNo !== 'No' ? `[Vehicle: ${visitor.vehicleNo}]` : (visitor.hasVehicle === 'no' ? '[Vehicle: No]' : '');
                // Embed Extra members tag
                const extraTag = visitor.hasExtraMembers === 'yes' ? `[Extra: ${visitor.extraMembersCount || 1} Members${visitor.extraMembersIds ? ` (${visitor.extraMembersIds})` : ''}]` : '';

                const metaTags = [idTag, vehicleTag, extraTag].filter(Boolean).join(' ');
                if (metaTags && (!fallbackVisitor.purpose || !fallbackVisitor.purpose.includes('['))) {
                    fallbackVisitor.purpose = fallbackVisitor.purpose ? `${fallbackVisitor.purpose} ${metaTags}` : metaTags;
                }

                delete fallbackVisitor.visitorNo;
                delete fallbackVisitor.idType;
                delete fallbackVisitor.idNumber;
                delete fallbackVisitor.hasVehicle;
                delete fallbackVisitor.vehicleNo;
                delete fallbackVisitor.hasExtraMembers;
                delete fallbackVisitor.extraMembersCount;
                delete fallbackVisitor.extraMembersIds;

                const retry = await supabase.from('visitors').insert([fallbackVisitor]).select();
                if (retry.error) throw retry.error;
                const saved = normalizeVisitor(retry.data[0]);
                return {
                    ...saved,
                    visitorNo: visitor.visitorNo || saved.id,
                    idType: visitor.idType || null,
                    idNumber: visitor.idNumber || null,
                    hasVehicle: visitor.hasVehicle || 'no',
                    vehicleNo: visitor.vehicleNo || 'No',
                    hasExtraMembers: visitor.hasExtraMembers || 'no',
                    extraMembersCount: visitor.extraMembersCount || 0,
                    extraMembersIds: visitor.extraMembersIds || null
                };
            }
            if (error) throw error;
            return normalizeVisitor(data[0]);
        },
        async toArray() {
            const { data, error } = await supabase.from('visitors').select('*');
            if (error) throw error;
            return (data || []).map(normalizeVisitor);
        },
        async get(id) {
            const targetId = typeof id === 'object' && id !== null ? id.id : id;
            const { data, error } = await supabase.from('visitors').select('*').eq('id', targetId).single();
            if (error) {
                if (error.code === 'PGRST116') return null; // Not found
                throw error;
            }
            return normalizeVisitor(data);
        },
        async update(id, changes) {
            let updatePayload = { ...changes };
            let { data, error } = await supabase.from('visitors').update(updatePayload).eq('id', id).select();
            if (error && (error.code === 'PGRST204' || error.message?.includes('hostName'))) {
                if ('hostName' in updatePayload) {
                    updatePayload.hostname = updatePayload.hostName;
                    delete updatePayload.hostName;
                }
                const retry = await supabase.from('visitors').update(updatePayload).eq('id', id).select();
                if (retry.error) throw retry.error;
                return normalizeVisitor(retry.data[0]);
            }
            if (error) throw error;
            return normalizeVisitor(data[0]);
        },
        async delete(id) {
            const { error } = await supabase.from('visitors').delete().eq('id', id);
            if (error) throw error;
        },
        where(field) {
            // Flexible query builder supporting direct await, .first(), and .toArray()
            return {
                equals: (value) => {
                    const fetchQuery = async () => {
                        const { data, error } = await supabase
                            .from('visitors')
                            .select('*')
                            .eq(field, value)
                            .order('created_at', { ascending: false });
                        if (error) throw error;
                        return (data || []).map(normalizeVisitor);
                    };

                    const promise = fetchQuery();
                    promise.first = async () => {
                        const items = await fetchQuery();
                        return items.find(v => v.status === 'checked-in') || items[0] || null;
                    };
                    promise.toArray = async () => {
                        return await fetchQuery();
                    };
                    return promise;
                },
                startsWith: {
                    toArray: async (value) => {
                        const { data, error } = await supabase.from('visitors').select('*').like(field, `${value}%`);
                        if (error) throw error;
                        return (data || []).map(normalizeVisitor);
                    }
                }
            };
        }
    },
    users: {
        async get(query) {
            // Simplified for backward compatibility: query is an object like { username }
            const keys = Object.keys(query);
            if (keys.length === 0) return null;
            
            const field = keys[0];
            const value = query[field];
            
            const { data, error } = await supabase.from('users').select('*').eq(field, value).single();
            if (error) {
                if (error.code === 'PGRST116') return null; // Not found
                throw error;
            }
            return data;
        },
        async toArray() {
            const { data, error } = await supabase.from('users').select('*');
            if (error) throw error;
            return data;
        },
        async add(user) {
            const { data, error } = await supabase.from('users').insert([user]).select();
            if (error) throw error;
            return data[0];
        },
        async bulkAdd(users) {
            const { data, error } = await supabase.from('users').insert(users).select();
            if (error) throw error;
            return data;
        },
        where(field) {
            return {
                equals: (value) => {
                    return {
                        count: async () => {
                            const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq(field, value);
                            if (error) throw error;
                            return count || 0;
                        }
                    }
                }
            };
        }
    },
    preregistered: {
        async toArray() {
            const { data, error } = await supabase.from('preregistered').select('*');
            if (error) throw error;
            return data;
        },
        async add(prereg) {
            // Attempt insert with full payload
            let { data, error } = await supabase.from('preregistered').insert([prereg]).select();
            if (error && (error.code === 'PGRST204' || error.message?.includes('column'))) {
                // If optional columns like 'company' or 'purpose' do not exist in the table, insert core columns
                const safePayload = {
                    name: prereg.name,
                    hostName: prereg.hostName,
                    expectedDate: prereg.expectedDate,
                    status: prereg.status || 'expected'
                };
                const retry = await supabase.from('preregistered').insert([safePayload]).select();
                if (retry.error) throw retry.error;
                return retry.data[0];
            }
            if (error) throw error;
            return data[0];
        },
        async update(id, changes) {
            const { data, error } = await supabase.from('preregistered').update(changes).eq('id', id).select();
            if (error) throw error;
            return data[0];
        },
        async delete(id) {
            const { error } = await supabase.from('preregistered').delete().eq('id', id);
            if (error) throw error;
        }
    }
};

// Seed default users if they don't exist
export async function seedUsers() {
    try {
        const count = await db.users.where('username').equals('admin').count();
        if (count === 0) {
            await db.users.bulkAdd([
                { username: 'admin', password: 'admin123', role: 'admin' },
                { username: 'security', password: 'sec123', role: 'security' }
            ]);
            console.log('Default users seeded in Supabase.');
        }
    } catch (error) {
        console.error('Error seeding users:', error);
    }
}

export async function generateVisitorId() {
    const today = new Date();
    const dateStr = today.getFullYear() + 
                    String(today.getMonth() + 1).padStart(2, '0') + 
                    String(today.getDate()).padStart(2, '0');
    
    const prefix = `VIS-${dateStr}-`;
    
    try {
        const visitorsToday = await db.visitors.where('id').startsWith.toArray(prefix);
            
        let nextSeq = 1;
        if (visitorsToday && visitorsToday.length > 0) {
            const seqs = visitorsToday.map(v => {
                const parts = v.id.split('-');
                return parseInt(parts[2], 10);
            });
            nextSeq = Math.max(...seqs) + 1;
        }
        
        return `${prefix}${String(nextSeq).padStart(4, '0')}`;
    } catch (error) {
        console.error("Error generating visitor id:", error);
        // Fallback random generation
        return `${prefix}${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
    }
}
