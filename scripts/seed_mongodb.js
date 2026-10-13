import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/visitor_db';

async function seed() {
    console.log(`Connecting to MongoDB at: ${uri}`);
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const dbName = uri.split('/').pop().split('?')[0] || 'visitor_db';
        const db = client.db(dbName);

        console.log(`Using database: ${dbName}`);

        // Create indexes
        const visitors = db.collection('visitors');
        await visitors.createIndex({ status: 1 });
        await visitors.createIndex({ created_at: -1 });
        await visitors.createIndex({ checkInTime: -1 });
        await visitors.createIndex({ phone: 1 });
        await visitors.createIndex({ id: 1 }, { unique: true });
        console.log('✓ Visitors collection indexes created.');

        const users = db.collection('users');
        await users.createIndex({ username: 1 }, { unique: true });
        
        // Seed default users
        const defaultUsers = [
            { username: 'admin', password: 'admin123', role: 'admin', created_at: new Date().toISOString() },
            { username: 'security', password: 'sec123', role: 'security', created_at: new Date().toISOString() }
        ];

        for (const u of defaultUsers) {
            await users.updateOne({ username: u.username }, { $setOnInsert: u }, { upsert: true });
        }
        console.log('✓ Default users seeded (admin / admin123, security / sec123).');

        const prereg = db.collection('preregistered');
        await prereg.createIndex({ status: 1 });
        await prereg.createIndex({ created_at: -1 });
        console.log('✓ Preregistered collection indexes created.');

        const hosts = db.collection('hosts');
        await hosts.createIndex({ name: 1 }, { unique: true });
        console.log('✓ Hosts collection indexes created.');

        console.log('\n🎉 MongoDB database setup and seeding completed successfully!');
    } catch (err) {
        console.error('Error seeding MongoDB:', err);
    } finally {
        await client.close();
    }
}

seed();
