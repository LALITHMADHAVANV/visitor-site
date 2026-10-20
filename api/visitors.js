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
            const { id, visitorNo, phone, startsWith, field, value, includePhoto } = req.query || {};

            if (id) {
                const cleanId = String(id).trim();
                const visitor = await collection.findOne({
                    $or: [
                        { id: cleanId },
                        { _id: cleanId },
                        { visitorNo: cleanId },
                        { id: { $regex: `^${cleanId}$`, $options: 'i' } },
                        { visitorNo: { $regex: `^${cleanId}$`, $options: 'i' } }
                    ]
                });
                return res.status(200).json(normalizeDoc(visitor));
            }

            if (visitorNo) {
                const cleanNo = String(visitorNo).trim();
                const visitor = await collection.findOne({
                    $or: [
                        { visitorNo: cleanNo },
                        { id: cleanNo },
                        { _id: cleanNo },
                        { visitorNo: { $regex: `^${cleanNo}$`, $options: 'i' } },
                        { id: { $regex: `^${cleanNo}$`, $options: 'i' } }
                    ]
                });
                return res.status(200).json(normalizeDoc(visitor));
            }

            const page = Math.max(1, parseInt(req.query?.page) || 1);
            const limit = Math.max(0, parseInt(req.query?.limit) || 0);
            const skip = (page - 1) * limit;

            // For paginated chunks (<= 50 items), photos are included by default so photos display crisp and clear.
            // For full bulk list without limit, heavy photos are omitted to prevent network stalls.
            const wantsPhotos = includePhoto === 'true' || (limit > 0 && limit <= 50 && includePhoto !== 'false');
            const projection = wantsPhotos ? {} : { photoData: 0, photo: 0, photo_data: 0 };

            let filter = {};
            if (phone) {
                filter.phone = String(phone).trim();
            } else if (startsWith) {
                filter.id = { $regex: `^${startsWith}`, $options: 'i' };
            } else if (field && value) {
                const cleanVal = String(value).trim();
                filter.$or = [
                    { [field]: cleanVal },
                    { [field]: { $regex: `^${cleanVal}$`, $options: 'i' } }
                ];
            } else {
                const search = (req.query?.search || '').trim();
                const status = (req.query?.status || 'all').trim();
                const fromDate = (req.query?.fromDate || '').trim();
                const toDate = (req.query?.toDate || '').trim();

                const andConditions = [];

                if (search) {
                    const searchRegex = { $regex: search, $options: 'i' };
                    andConditions.push({
                        $or: [
                            { name: searchRegex },
                            { id: searchRegex },
                            { visitorNo: searchRegex },
                            { company: searchRegex },
                            { phone: searchRegex },
                            { hostName: searchRegex },
                            { idNumber: searchRegex },
                            { idType: searchRegex }
                        ]
                    });
                }

                if (status && status !== 'all') {
                    andConditions.push({ status });
                }

                if (fromDate || toDate) {
                    const dateFilter = {};
                    if (fromDate) dateFilter.$gte = fromDate;
                    if (toDate) dateFilter.$lte = toDate + 'T23:59:59.999Z';
                    andConditions.push({
                        $or: [
                            { checkInTime: dateFilter },
                            { created_at: dateFilter }
                        ]
                    });
                }

                if (andConditions.length > 0) {
                    filter = { $and: andConditions };
                }
            }

            const total = await collection.countDocuments(filter);
            const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

            let cursor = collection.find(filter, { projection }).sort({ checkInTime: -1, created_at: -1 });
            if (limit > 0) {
                cursor = cursor.skip(skip).limit(limit);
            }

            const visitors = await cursor.toArray();
            const normalized = visitors.map(normalizeDoc);

            if (req.query?.paginated === 'true') {
                return res.status(200).json({
                    visitors: normalized,
                    total,
                    page,
                    limit: limit || total,
                    totalPages
                });
            }

            res.setHeader('X-Total-Count', String(total));
            res.setHeader('X-Total-Pages', String(totalPages));
            res.setHeader('X-Current-Page', String(page));
            return res.status(200).json(normalized);
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
