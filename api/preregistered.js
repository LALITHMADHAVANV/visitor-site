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
        const collection = await getCollection('preregistered');

        if (req.method === 'GET') {
            const list = await collection.find({}).sort({ created_at: -1 }).toArray();
            return res.status(200).json(list.map(normalizeDoc));
        }

        if (req.method === 'POST') {
            const item = req.body;
            const id = item.id || `PREREG-${Date.now()}`;
            const doc = {
                id,
                _id: id,
                ...item,
                status: item.status || 'expected',
                created_at: item.created_at || new Date().toISOString()
            };

            await collection.replaceOne({ _id: id }, doc, { upsert: true });
            return res.status(200).json(normalizeDoc(doc));
        }

        if (req.method === 'PUT') {
            const { id } = req.query;
            const changes = req.body;
            const targetId = id || changes?.id;
            if (!targetId) {
                return res.status(400).json({ error: 'ID is required' });
            }
            const updatePayload = { ...changes };
            delete updatePayload._id;

            await collection.updateOne(
                { $or: [{ id: targetId }, { _id: targetId }] },
                { $set: updatePayload }
            );
            const updated = await collection.findOne({ $or: [{ id: targetId }, { _id: targetId }] });
            return res.status(200).json(normalizeDoc(updated));
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ error: 'ID is required' });
            }
            await collection.deleteOne({ $or: [{ id: id }, { _id: id }] });
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('API preregistered error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
