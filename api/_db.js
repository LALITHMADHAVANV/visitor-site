import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/visitor_db';

let cachedClient = global._mongoClient || null;
let cachedDb = global._mongoDb || null;

let indexesEnsured = false;
async function ensureIndexes(db) {
    if (indexesEnsured) return;
    indexesEnsured = true;
    try {
        const col = db.collection('visitors');
        col.createIndex({ checkInTime: -1 }, { background: true }).catch(() => {});
        col.createIndex({ created_at: -1 }, { background: true }).catch(() => {});
        col.createIndex({ status: 1 }, { background: true }).catch(() => {});
        col.createIndex({ visitorNo: 1 }, { background: true }).catch(() => {});
    } catch (_e) {}
}

export async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        ensureIndexes(cachedDb);
        return { client: cachedClient, db: cachedDb };
    }

    if (!global._mongoClientPromise) {
        const client = new MongoClient(uri, {
            connectTimeoutMS: 5000,
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
        });
        global._mongoClientPromise = client.connect().catch(err => {
            global._mongoClientPromise = null;
            throw err;
        });
    }

    const client = await global._mongoClientPromise;
    const dbName = uri.split('/').pop().split('?')[0] || 'visitor_db';
    const db = client.db(dbName);

    global._mongoClient = client;
    global._mongoDb = db;
    cachedClient = client;
    cachedDb = db;

    ensureIndexes(db);

    return { client, db };
}

export async function getCollection(collectionName) {
    const { db } = await connectToDatabase();
    return db.collection(collectionName);
}

