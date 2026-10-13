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
    // Extract ID tag if not present
    if ((!v.idType || !v.idNumber) && v.purpose && v.purpose.includes('[ID:')) {
        const match = v.purpose.match(/\[ID:\s*([^\]\-]+?)(?:\s*-\s*([^\]]+))?\]/);
        if (match) {
            if (!v.idType) v.idType = match[1].trim();
            if (!v.idNumber && match[2]) v.idNumber = match[2].trim();
        }
    }
    // Extract Vehicle tag if not present
    if (!v.vehicleNo && v.purpose && v.purpose.includes('[Vehicle:')) {
        const match = v.purpose.match(/\[Vehicle:\s*([^\]]+)\]/);
        if (match) {
            v.vehicleNo = match[1].trim();
            v.hasVehicle = v.vehicleNo.toLowerCase() === 'no' ? 'no' : 'yes';
        }
    }
    // Extract Extra members tag if not present
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
            const res = await fetch('/api/visitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(visitor)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to add visitor to MongoDB');
            }
            const data = await res.json();
            return normalizeVisitor(data);
        },
        async toArray() {
            const res = await fetch('/api/visitors');
            if (!res.ok) throw new Error('Failed to fetch visitors from MongoDB');
            const data = await res.json();
            return (data || []).map(normalizeVisitor);
        },
        async get(id) {
            const targetId = typeof id === 'object' && id !== null ? id.id : id;
            if (!targetId) return null;
            const res = await fetch(`/api/visitors?id=${encodeURIComponent(targetId)}`);
            if (!res.ok) return null;
            const data = await res.json();
            return normalizeVisitor(data);
        },
        async update(id, changes) {
            const targetId = typeof id === 'object' && id !== null ? id.id : id;
            const res = await fetch(`/api/visitors?id=${encodeURIComponent(targetId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: targetId, ...changes })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update visitor in MongoDB');
            }
            const data = await res.json();
            return normalizeVisitor(data);
        },
        async delete(id) {
            const targetId = typeof id === 'object' && id !== null ? id.id : id;
            const res = await fetch(`/api/visitors?id=${encodeURIComponent(targetId)}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete visitor from MongoDB');
        },
        where(field) {
            return {
                equals: (value) => {
                    const fetchQuery = async () => {
                        const res = await fetch(`/api/visitors?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`);
                        if (!res.ok) return [];
                        const data = await res.json();
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
                        const res = await fetch(`/api/visitors?startsWith=${encodeURIComponent(value)}`);
                        if (!res.ok) return [];
                        const data = await res.json();
                        return (data || []).map(normalizeVisitor);
                    }
                }
            };
        }
    },
    users: {
        async get(query) {
            const keys = Object.keys(query || {});
            if (keys.length === 0) return null;
            const field = keys[0];
            const value = query[field];
            if (field === 'username') {
                const res = await fetch(`/api/users?username=${encodeURIComponent(value)}`);
                if (!res.ok) return null;
                return await res.json();
            }
            const res = await fetch('/api/users');
            if (!res.ok) return null;
            const users = await res.json();
            return (users || []).find(u => u[field] === value) || null;
        },
        async toArray() {
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error('Failed to fetch users from MongoDB');
            return await res.json();
        },
        async add(user) {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });
            if (!res.ok) throw new Error('Failed to add user to MongoDB');
            return await res.json();
        },
        async bulkAdd(users) {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(users)
            });
            if (!res.ok) throw new Error('Failed to bulk add users to MongoDB');
            return await res.json();
        },
        where(field) {
            return {
                equals: (value) => {
                    return {
                        count: async () => {
                            const res = await fetch(`/api/users?countOnly=true&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`);
                            if (!res.ok) return 0;
                            const data = await res.json();
                            return data.count || 0;
                        }
                    };
                }
            };
        }
    },
    preregistered: {
        async toArray() {
            const res = await fetch('/api/preregistered');
            if (!res.ok) throw new Error('Failed to fetch preregistered visitors from MongoDB');
            return await res.json();
        },
        async add(prereg) {
            const res = await fetch('/api/preregistered', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prereg)
            });
            if (!res.ok) throw new Error('Failed to add preregistered visitor to MongoDB');
            return await res.json();
        },
        async update(id, changes) {
            const targetId = typeof id === 'object' && id !== null ? id.id : id;
            const res = await fetch(`/api/preregistered?id=${encodeURIComponent(targetId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: targetId, ...changes })
            });
            if (!res.ok) throw new Error('Failed to update preregistered visitor in MongoDB');
            return await res.json();
        },
        async delete(id) {
            const targetId = typeof id === 'object' && id !== null ? id.id : id;
            const res = await fetch(`/api/preregistered?id=${encodeURIComponent(targetId)}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete preregistered visitor from MongoDB');
        }
    }
};

// Seed default admin and security users if they don't exist
export async function seedUsers() {
    try {
        const count = await db.users.where('username').equals('admin').count();
        if (count === 0) {
            await db.users.bulkAdd([
                { username: 'admin', password: 'admin123', role: 'admin' },
                { username: 'security', password: 'sec123', role: 'security' }
            ]);
            console.log('Default users seeded in MongoDB.');
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
                const parts = (v.id || '').split('-');
                return parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
            });
            nextSeq = Math.max(...seqs, 0) + 1;
        }
        
        return `${prefix}${String(nextSeq).padStart(4, '0')}`;
    } catch (error) {
        console.error("Error generating visitor id:", error);
        return `${prefix}${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
    }
}
