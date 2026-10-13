import { getCollection } from './_db.js';

function normalizeDoc(doc) {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return {
        id: rest.id || (_id ? _id.toString() : null),
        ...rest
    };
}

export default async function handler(req, res) {
    try {
        const collection = await getCollection('hosts');

        if (req.method === 'GET') {
            const { name } = req.query || {};

            if (name) {
                const cleanName = name.trim().toUpperCase();
                const host = await collection.findOne({
                    name: { $regex: `^${cleanName}$`, $options: 'i' }
                });
                return res.status(200).json(normalizeDoc(host));
            }

            const hosts = await collection.find({}).sort({ name: 1 }).toArray();
            const hostNamesSet = new Set(hosts.map(h => (h.name || '').trim().toUpperCase()).filter(Boolean));

            // Also include unique host names from visitors collection
            try {
                const visitorsCollection = await getCollection('visitors');
                const distinctVisitorHosts = await visitorsCollection.distinct('hostName');
                for (const h of distinctVisitorHosts) {
                    if (h && typeof h === 'string' && h.trim()) {
                        const cleanH = h.trim().toUpperCase();
                        if (!hostNamesSet.has(cleanH)) {
                            hosts.push({ name: cleanH, department: '' });
                            hostNamesSet.add(cleanH);
                        }
                    }
                }
            } catch (err) {
                // Ignore if distinct fails
            }

            return res.status(200).json(hosts.map(normalizeDoc));
        }

        if (req.method === 'POST') {
            const { name, department, chat_id, telegram_username } = req.body || {};
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Host name is required' });
            }

            const cleanName = name.trim().toUpperCase();
            const setObj = {
                name: cleanName,
                updated_at: new Date().toISOString()
            };
            if (department !== undefined) setObj.department = (department || '').trim().toUpperCase();
            if (chat_id !== undefined && chat_id !== null && chat_id !== '') setObj.chat_id = chat_id;
            if (telegram_username !== undefined) setObj.telegram_username = telegram_username || '';

            await collection.updateOne(
                { name: { $regex: `^${cleanName}$`, $options: 'i' } },
                { 
                    $set: setObj,
                    $setOnInsert: { created_at: new Date().toISOString() }
                },
                { upsert: true }
            );

            const updated = await collection.findOne({ name: { $regex: `^${cleanName}$`, $options: 'i' } });
            return res.status(200).json(normalizeDoc(updated));
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('API hosts error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
