import { getCollection } from './_db.js';

function normalizeDoc(doc) {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { id: rest.id || (_id ? _id.toString() : null), ...rest };
}

export default async function handler(req, res) {
    try {
        const collection = await getCollection('users');

        if (req.method === 'GET') {
            const { username, countOnly, field, value } = req.query || {};

            if (countOnly && field && value) {
                const query = {};
                query[field] = value;
                const count = await collection.countDocuments(query);
                return res.status(200).json({ count });
            }

            if (username) {
                const user = await collection.findOne({ username });
                return res.status(200).json(normalizeDoc(user));
            }

            const users = await collection.find({}).toArray();
            return res.status(200).json(users.map(normalizeDoc));
        }

        if (req.method === 'POST') {
            const body = req.body;

            if (Array.isArray(body)) {
                // Bulk insert
                const usersWithDate = body.map(u => ({
                    ...u,
                    created_at: u.created_at || new Date().toISOString()
                }));
                for (const u of usersWithDate) {
                    await collection.updateOne(
                        { username: u.username },
                        { $set: u },
                        { upsert: true }
                    );
                }
                return res.status(200).json(usersWithDate);
            }

            // Single insert
            const user = {
                ...body,
                created_at: body.created_at || new Date().toISOString()
            };
            await collection.updateOne(
                { username: user.username },
                { $set: user },
                { upsert: true }
            );
            return res.status(200).json(normalizeDoc(user));
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('API users error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
