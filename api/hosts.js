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

            const hosts = await collection.find({}).toArray();
            return res.status(200).json(hosts.map(normalizeDoc));
        }

        if (req.method === 'POST') {
            const { name, chat_id, telegram_username } = req.body || {};
            if (!name || !chat_id) {
                return res.status(400).json({ error: 'Name and chat_id are required' });
            }

            const cleanName = name.trim().toUpperCase();
            const payload = {
                name: cleanName,
                chat_id,
                telegram_username: telegram_username || '',
                registered_at: new Date().toISOString()
            };

            await collection.updateOne(
                { name: { $regex: `^${cleanName}$`, $options: 'i' } },
                { $set: payload },
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
