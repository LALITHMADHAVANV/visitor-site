import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to load .env variables if not already in process.env
function loadEnv() {
    try {
        const envPath = path.join(projectRoot, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const eqIndex = trimmed.indexOf('=');
                    if (eqIndex > 0) {
                        const key = trimmed.slice(0, eqIndex).trim();
                        let value = trimmed.slice(eqIndex + 1).trim();
                        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        if (!process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                }
            });
        }
    } catch {
        // Ignore .env read error
    }
}

loadEnv();

function printHelp() {
    console.log(`
========================================================================
  VMS - Visitor JSON Data Import Tool
========================================================================
Usage:
  node scripts/import_visitors.js <path-to-json-file> [options]

Examples:
  node scripts/import_visitors.js ./data.json
  node scripts/import_visitors.js ./visitors_old.json --dry-run
  node scripts/import_visitors.js ./backup.json --drop

Options:
  --dry-run       Preview parsed records without inserting to database
  --drop          Clear the existing visitors collection before importing
  --uri=<uri>     Override MongoDB connection URI
  --help, -h      Show this help message
========================================================================
`);
}

// Convert various date formats into valid ISO string
function parseIsoDate(val) {
    if (!val) return null;
    if (typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val.toISOString();
    }
    return null;
}

// Extract tags like [ID: ...], [Vehicle: ...], [Extra: ...] from purpose if present
function parsePurposeTags(purpose = '') {
    const extracted = {};
    if (!purpose || typeof purpose !== 'string') return extracted;

    const idMatch = purpose.match(/\[ID:\s*([^\]-]+?)(?:\s*-\s*([^\]]+))?\]/);
    if (idMatch) {
        if (idMatch[1]) extracted.idType = idMatch[1].trim();
        if (idMatch[2]) extracted.idNumber = idMatch[2].trim();
    }

    const vehicleMatch = purpose.match(/\[Vehicle:\s*([^\]]+)\]/);
    if (vehicleMatch) {
        extracted.vehicleNo = vehicleMatch[1].trim();
        extracted.hasVehicle = extracted.vehicleNo.toLowerCase() === 'no' ? 'no' : 'yes';
    }

    const extraMatch = purpose.match(/\[Extra:\s*(\d+)\s*Members?\s*(?:\(([^\]]+)\))?\]/);
    if (extraMatch) {
        extracted.hasExtraMembers = 'yes';
        extracted.extraMembersCount = parseInt(extraMatch[1], 10) || 0;
        extracted.extraMembersIds = extraMatch[2] ? extraMatch[2].trim() : '';
    }

    return extracted;
}

// Generate fallback ID
function generateFallbackId(index) {
    const today = new Date();
    const dateStr = today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');
    return `VIS-${dateStr}-IMP${String(index + 1).padStart(4, '0')}`;
}

// Normalize record from old JSON into exact schema needed by MongoDB / VMS
function normalizeRecord(item, index) {
    if (!item || typeof item !== 'object') return null;

    const purpose = item.purpose || item.reason || item.purposeOfVisit || item.purpose_of_visit || '';
    const extractedTags = parsePurposeTags(purpose);

    // Primary ID
    const rawId = item.id || item._id || item.visitor_id || item.visitorId;
    const finalId = rawId ? String(rawId).trim() : generateFallbackId(index);

    // Visitor Badge / Number
    const visitorNo = item.visitorNo || item.visitor_no || item.visitorNumber || item.badgeNumber || item.badge_number || item.badge || item.passNo || item.pass_number || item.token || finalId;

    // Contact info & identity
    const name = item.name || item.visitorName || item.visitor_name || item.fullName || item.full_name || 'Visitor';
    const phone = item.phone || item.phoneNumber || item.phone_number || item.mobile || item.mobileNo || item.contact || '';
    const company = item.company || item.companyName || item.company_name || item.organization || item.org || '';

    // ID proof
    const idType = item.idType || item.id_type || item.id_proof_type || item.proofType || extractedTags.idType || null;
    const idNumber = item.idNumber || item.id_number || item.id_proof_number || item.proofNumber || extractedTags.idNumber || null;

    // Vehicle
    let hasVehicle = item.hasVehicle || item.has_vehicle;
    if (typeof hasVehicle === 'boolean') {
        hasVehicle = hasVehicle ? 'yes' : 'no';
    } else if (hasVehicle) {
        hasVehicle = String(hasVehicle).toLowerCase() === 'yes' ? 'yes' : 'no';
    } else if (item.vehicleNo || item.vehicle_no) {
        hasVehicle = 'yes';
    } else {
        hasVehicle = extractedTags.hasVehicle || 'no';
    }
    const vehicleNo = item.vehicleNo || item.vehicle_no || item.vehicleNumber || extractedTags.vehicleNo || null;

    // Extra members
    let hasExtraMembers = item.hasExtraMembers || item.has_extra_members;
    if (typeof hasExtraMembers === 'boolean') {
        hasExtraMembers = hasExtraMembers ? 'yes' : 'no';
    } else if (hasExtraMembers) {
        hasExtraMembers = String(hasExtraMembers).toLowerCase() === 'yes' ? 'yes' : 'no';
    } else if (item.extraMembersCount || item.extra_members_count) {
        hasExtraMembers = 'yes';
    } else {
        hasExtraMembers = extractedTags.hasExtraMembers || 'no';
    }

    const extraMembersCount = parseInt(item.extraMembersCount || item.extra_members_count || item.extraMembers || extractedTags.extraMembersCount || 0, 10) || 0;
    const extraMembersIds = item.extraMembersIds || item.extra_members_ids || extractedTags.extraMembersIds || '';

    // Host & Purpose
    const hostName = item.hostName || item.host_name || item.hostname || item.host || item.whomToMeet || item.whom_to_meet || item.employee || '';

    // Photo
    const photoData = item.photoData || item.photo_data || item.photo || item.photoUrl || item.photo_url || item.image || null;

    // Timestamps
    const checkInTime = parseIsoDate(item.checkInTime || item.check_in_time || item.checkin_time || item.in_time || item.created_at || item.createdAt);
    const checkOutTime = parseIsoDate(item.checkOutTime || item.check_out_time || item.checkout_time || item.out_time);
    const createdAt = parseIsoDate(item.created_at || item.createdAt || item.date || item.timestamp || checkInTime) || new Date().toISOString();

    // Status
    let status = item.status;
    if (!status) {
        if (checkOutTime) {
            status = 'checked-out';
        } else if (checkInTime) {
            status = 'checked-in';
        } else {
            status = 'registered';
        }
    }

    const authPin = item.auth_pin || item.authPin || item.pin || null;

    return {
        _id: String(finalId),
        id: String(finalId),
        visitorNo: String(visitorNo),
        name: String(name),
        phone: String(phone),
        company: String(company),
        idType: idType ? String(idType) : null,
        idNumber: idNumber ? String(idNumber) : null,
        hasVehicle: hasVehicle === 'yes' ? 'yes' : 'no',
        vehicleNo: vehicleNo ? String(vehicleNo) : null,
        hasExtraMembers: hasExtraMembers === 'yes' ? 'yes' : 'no',
        extraMembersCount: Number(extraMembersCount),
        extraMembersIds: String(extraMembersIds),
        hostName: String(hostName),
        purpose: String(purpose),
        photoData: photoData ? String(photoData) : null,
        status: String(status),
        checkInTime: checkInTime,
        checkOutTime: checkOutTime,
        auth_pin: authPin,
        created_at: createdAt
    };
}

// Read and parse JSON content (supports Array, Object with array, or NDJSON)
function readJsonData(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) {
        throw new Error(`File is empty: ${filePath}`);
    }

    // Try standard JSON.parse
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (typeof parsed === 'object' && parsed !== null) {
            // Check for common wrapper keys: { "visitors": [...] }, { "data": [...] }, { "rows": [...] }
            const candidates = ['visitors', 'data', 'rows', 'results', 'records', 'items'];
            for (const key of candidates) {
                if (Array.isArray(parsed[key])) {
                    return parsed[key];
                }
            }
            // If single object
            return [parsed];
        }
    } catch (e) {
        // Try parsing as NDJSON (JSON Lines)
        const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
        const records = [];
        for (const line of lines) {
            try {
                records.push(JSON.parse(line));
            } catch {
                // If line fails, throw original syntax error
                throw new Error(`Invalid JSON format in file: ${e.message}`);
            }
        }
        if (records.length > 0) {
            return records;
        }
        throw e;
    }

    throw new Error('Unsupported JSON format. Expected an array of visitor objects or an object containing an array.');
}

async function runImport() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    const isDryRun = args.includes('--dry-run');
    const shouldDrop = args.includes('--drop');
    const uriArg = args.find(a => a.startsWith('--uri='));
    const customUri = uriArg ? uriArg.split('=')[1] : null;

    // Find input file path
    const fileArg = args.find(a => !a.startsWith('--'));
    let targetFilePath = fileArg ? path.resolve(process.cwd(), fileArg) : null;

    if (!targetFilePath) {
        // Auto-detect common filenames in project root or scripts directory
        const commonNames = [
            'visitors.json',
            'old_visitors.json',
            'visitors_old.json',
            'data.json',
            'backup.json',
            'visitors_backup.json',
            'data/visitors.json',
            'scripts/visitors.json'
        ];

        for (const name of commonNames) {
            const checkPath = path.join(projectRoot, name);
            if (fs.existsSync(checkPath)) {
                targetFilePath = checkPath;
                console.log(`ℹ️  No file specified, auto-detected: ${path.relative(projectRoot, checkPath)}`);
                break;
            }
        }
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        console.error(`\n❌ Error: Please specify the path to your JSON file.`);
        printHelp();
        process.exit(1);
    }

    console.log(`\n📂 Reading JSON file: ${targetFilePath}`);
    const rawItems = readJsonData(targetFilePath);
    console.log(`📊 Found ${rawItems.length} total item(s) in JSON file.`);

    if (rawItems.length === 0) {
        console.log('⚠️  No records to import. Exiting.');
        process.exit(0);
    }

    // Normalize records
    const normalizedDocs = [];
    for (let i = 0; i < rawItems.length; i++) {
        const doc = normalizeRecord(rawItems[i], i);
        if (doc) {
            normalizedDocs.push(doc);
        }
    }

    console.log(`✓ Normalized ${normalizedDocs.length} visitor record(s).`);

    // Preview sample record
    console.log('\n🔍 Preview of first normalized record:');
    console.log(JSON.stringify(normalizedDocs[0], null, 2));

    if (isDryRun) {
        console.log('\n✨ [DRY RUN] No changes were written to the database.');
        console.log(`✨ Successfully validated ${normalizedDocs.length} records ready for import.`);
        process.exit(0);
    }

    const uri = 'mongodb+srv://lalithmadhavan2005_db_user:5Er1LsAVvAnwrWG2@cluster0.ucek7vf.mongodb.net/visitor?appName=Cluster0';
    console.log(`\n🔌 Connecting to MongoDB: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    const client = new MongoClient(uri, {
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
    });

    try {
        await client.connect();
        const dbName = uri.split('/').pop().split('?')[0] || 'visitor_db';
        const db = client.db(dbName);
        const collection = db.collection('visitors');

        // Ensure proper indexes exist
        await collection.createIndex({ id: 1 }, { unique: true });
        await collection.createIndex({ status: 1 });
        await collection.createIndex({ created_at: -1 });
        await collection.createIndex({ checkInTime: -1 });
        await collection.createIndex({ phone: 1 });
        console.log('✓ Collection indexes verified.');

        if (shouldDrop) {
            console.log('⚠️  --drop flag detected. Clearing existing visitors collection...');
            await collection.deleteMany({});
            console.log('✓ Visitors collection cleared.');
        }

        // Perform bulk upsert in batches of 500
        const batchSize = 500;
        let totalUpserted = 0;
        let totalModified = 0;

        for (let i = 0; i < normalizedDocs.length; i += batchSize) {
            const batch = normalizedDocs.slice(i, i + batchSize);
            const operations = batch.map(doc => ({
                replaceOne: {
                    filter: { _id: doc._id },
                    replacement: doc,
                    upsert: true
                }
            }));

            const result = await collection.bulkWrite(operations, { ordered: false });
            totalUpserted += result.upsertedCount + result.insertedCount;
            totalModified += result.modifiedCount;

            const progress = Math.min(i + batch.length, normalizedDocs.length);
            process.stdout.write(`⏳ Progress: ${progress}/${normalizedDocs.length} records processed...\r`);
        }

        console.log(`\n\n🎉 Import Complete!`);
        console.log(`--------------------------------------------------`);
        console.log(`• Total records in JSON:     ${rawItems.length}`);
        console.log(`• Inserted / New:            ${totalUpserted}`);
        console.log(`• Updated / Overwritten:     ${totalModified}`);
        const totalInDb = await collection.countDocuments();
        console.log(`• Total visitors now in DB:  ${totalInDb}`);
        console.log(`--------------------------------------------------\n`);

    } catch (err) {
        console.error('\n❌ Import failed with error:', err);
        process.exit(1);
    } finally {
        await client.close();
    }
}

runImport();
