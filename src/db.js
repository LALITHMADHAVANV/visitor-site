import { supabase } from './supabaseClient';

export const db = {
    visitors: {
        async add(visitor) {
            const { data, error } = await supabase.from('visitors').insert([visitor]).select();
            if (error) throw error;
            return data[0];
        },
        async toArray() {
            const { data, error } = await supabase.from('visitors').select('*');
            if (error) throw error;
            return data;
        },
        async get(id) {
            const { data, error } = await supabase.from('visitors').select('*').eq('id', id).single();
            if (error) {
                if (error.code === 'PGRST116') return null; // Not found
                throw error;
            }
            return data;
        },
        async update(id, changes) {
            const { data, error } = await supabase.from('visitors').update(changes).eq('id', id).select();
            if (error) throw error;
            return data[0];
        },
        async delete(id) {
            const { error } = await supabase.from('visitors').delete().eq('id', id);
            if (error) throw error;
        },
        where(field) {
            // Simplified mock query builder for backward compatibility
            return {
                equals: async (value) => {
                    const { data, error } = await supabase.from('visitors').select('*').eq(field, value);
                    if (error) throw error;
                    return data;
                },
                startsWith: {
                    toArray: async (value) => {
                        const { data, error } = await supabase.from('visitors').select('*').like(field, `${value}%`);
                        if (error) throw error;
                        return data;
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
