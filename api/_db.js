import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/visitor_db';

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const client = new MongoClient(uri, {
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
    });

    await client.connect();
    const dbName = uri.split('/').pop().split('?')[0] || 'visitor_db';
    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

export async function getCollection(collectionName) {
    const { db } = await connectToDatabase();
    return db.collection(collectionName);
}
