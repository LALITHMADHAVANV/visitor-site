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
        const collection = await getCollection('visitors');

        if (req.method === 'GET') {
            const { id, visitorNo, phone, startsWith, field, value } = req.query || {};

            if (id) {
                const visitor = await collection.findOne({ $or: [{ id: id }, { _id: id }] });
                return res.status(200).json(normalizeDoc(visitor));
            }

            if (visitorNo) {
                const visitor = await collection.findOne({ visitorNo: visitorNo });
                return res.status(200).json(normalizeDoc(visitor));
            }

            if (phone) {
                const visitors = await collection.find({ phone: phone }).sort({ created_at: -1 }).toArray();
                return res.status(200).json(visitors.map(normalizeDoc));
            }

            if (startsWith) {
                const visitors = await collection.find({ id: { $regex: `^${startsWith}` } }).toArray();
                return res.status(200).json(visitors.map(normalizeDoc));
            }

            if (field && value) {
                const filter = {};
                filter[field] = value;
                const visitors = await collection.find(filter).sort({ created_at: -1 }).toArray();
                return res.status(200).json(visitors.map(normalizeDoc));
            }

            const visitors = await collection.find({}).sort({ created_at: -1 }).toArray();
            return res.status(200).json(visitors.map(normalizeDoc));
        }

        if (req.method === 'POST') {
            const visitor = req.body;
            if (!visitor || !visitor.id) {
                return res.status(400).json({ error: 'Visitor data with id is required' });
            }
            if (!visitor.created_at) {
                visitor.created_at = new Date().toISOString();
            }
            const doc = { _id: visitor.id, ...visitor };
            await collection.replaceOne({ _id: visitor.id }, doc, { upsert: true });
            return res.status(200).json(normalizeDoc(doc));
        }

        if (req.method === 'PUT') {
            const { id } = req.query;
            const changes = req.body;
            const targetId = id || changes?.id;
            if (!targetId) {
                return res.status(400).json({ error: 'Visitor ID is required' });
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
                return res.status(400).json({ error: 'Visitor ID is required' });
            }
            await collection.deleteOne({ $or: [{ id: id }, { _id: id }] });
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('API visitors error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
