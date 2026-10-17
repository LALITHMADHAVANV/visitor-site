import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/visitor_db';

let cachedClient = global._mongoClient || null;
let cachedDb = global._mongoDb || null;

export async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    if (!global._mongoClientPromise) {
        const client = new MongoClient(uri, {
            connectTimeoutMS: 5000,
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
            minPoolSize: 1,
        });
        global._mongoClientPromise = client.connect();
    }

    const client = await global._mongoClientPromise;
    const dbName = uri.split('/').pop().split('?')[0] || 'visitor_db';
    const db = client.db(dbName);

    global._mongoClient = client;
    global._mongoDb = db;
    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

export async function getCollection(collectionName) {
    const { db } = await connectToDatabase();
    return db.collection(collectionName);
}

