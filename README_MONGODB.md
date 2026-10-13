# Visitor Management System (VMS) - MongoDB Database Schema & Guide

The project has been converted from Supabase (Postgres) to **MongoDB**.

## Environment Configuration

In your `.env` file, specify your MongoDB connection URI:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/visitor_db
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/visitor_db?retryWrites=true&w=majority
```

---

## Database Collections & Schema Structure

### 1. `visitors` Collection
Stores all visitor check-ins, registration details, photos, and check-out logs.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` / `id` | String | Primary Visitor ID (e.g. `VIS-20261009-0001`) |
| `visitorNo` | String | Visitor pass / badge number |
| `name` | String | Full name of visitor |
| `phone` | String | Contact phone number |
| `company` | String | Organization / company name |
| `idType` | String | Govt ID type (e.g. `Aadhar Number`, `PAN Number`) |
| `idNumber` | String | Corresponding ID number |
| `hasVehicle` | String | `'yes'` or `'no'` |
| `vehicleNo` | String | Vehicle registration number |
| `hasExtraMembers` | String | `'yes'` or `'no'` |
| `extraMembersCount` | Number | Count of accompanying members |
| `extraMembersIds` | String | Badge IDs of extra members |
| `hostName` | String | Host / Employee being visited |
| `purpose` | String | Purpose of visit |
| `photoData` | String | Base64 JPEG data URL for visitor photo |
| `status` | String | `'registered'`, `'checked-in'`, or `'checked-out'` |
| `checkInTime` | String / ISO Date | Timestamp when checked in |
| `checkOutTime` | String / ISO Date | Timestamp when checked out |
| `created_at` | String / ISO Date | Timestamp when created |

---

### 2. `users` Collection
Stores user accounts for administrative and security staff authentication.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId / String | Unique user ID |
| `username` | String | Unique username (`admin`, `security`) |
| `password` | String | User password |
| `role` | String | `'admin'`, `'security'`, or `'kiosk'` |
| `created_at` | String / ISO Date | Creation timestamp |

---

### 3. `preregistered` Collection
Stores pre-registered expected visitors created by hosts or admins.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` / `id` | String | Pre-registration ID (e.g. `PREREG-...`) |
| `name` | String | Expected visitor name |
| `company` | String | Visitor company |
| `hostName` | String | Host employee name |
| `expectedDate` | String | Date format `YYYY-MM-DD` |
| `purpose` | String | Purpose of expected visit |
| `status` | String | `'expected'` or `'arrived'` |
| `created_at` | String / ISO Date | Creation timestamp |

---

### 4. `hosts` Collection
Stores employee registrations for Telegram bot notification alerts.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId / String | Unique host ID |
| `name` | String | Uppercase employee name (e.g. `HARI RAGAVAN`) |
| `chat_id` | String | Telegram chat ID for DMs |
| `telegram_username` | String | Telegram username |
| `registered_at` | String / ISO Date | Registration timestamp |

---

## Seeding & Initial Setup

To seed the initial users and create collection indexes, run:

```bash
node scripts/seed_mongodb.js
```
