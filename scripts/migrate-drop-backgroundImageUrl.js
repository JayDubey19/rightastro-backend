/**
 * migrate-drop-backgroundImageUrl.js
 *
 * One-off migration for the backgroundImageUrl -> category refactor.
 *
 * Schema changes alone do NOT touch documents already in Mongo — existing
 * astrologers will still have a `backgroundImageUrl` field sitting in the
 * DB (Mongoose just stops projecting/validating it) and will be missing
 * `category` entirely until this runs.
 *
 * What this does:
 *   1. Sets category: 'vedic' (the default) on any document missing it.
 *   2. $unset's backgroundImageUrl from every document.
 *
 * Run once, e.g.:
 *   node migrate-drop-backgroundImageUrl.js
 *
 * Review the category backfill afterwards — 'vedic' is just a safe
 * default, not a real classification. If you have a way to map old
 * `expertise` values to a category (e.g. expertise includes "Tarot" ->
 * category: "tarot"), do that pass BEFORE running this, or adjust the
 * backfill logic below.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/your-db-name';

async function migrate() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const astrologers = db.collection('astrologers');

  const backfillResult = await astrologers.updateMany(
    { category: { $exists: false } },
    { $set: { category: 'vedic' } }
  );
  console.log(`Backfilled category on ${backfillResult.modifiedCount} document(s).`);

  const unsetResult = await astrologers.updateMany(
    { backgroundImageUrl: { $exists: true } },
    { $unset: { backgroundImageUrl: '' } }
  );
  console.log(`Removed backgroundImageUrl from ${unsetResult.modifiedCount} document(s).`);

  await mongoose.disconnect();
  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});