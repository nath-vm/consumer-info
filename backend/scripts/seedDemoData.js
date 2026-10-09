/**
 * Seeds a DEMO database with obviously fake consumer records, so you can run or publicly show
 * the app without ever touching real personal data.
 *
 *   MONGO_URI="mongodb+srv://.../consumerinfo_demo" npm run seed:demo -- --yes
 *
 * Safety rails (so this can never be pointed at production by accident):
 *   - the database name MUST contain the word "demo"
 *   - it never deletes anything; it refuses to run if the consumers collection already has data
 *   - it needs an explicit --yes
 */
const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn'];
const LAST = ['Demo', 'Example', 'Sample', 'Testcase', 'Placeholder'];
const STREETS = ['Example St', 'Sample Ave', 'Demo Road', 'Test Lane', 'Placeholder Blvd'];

/** Pure function (unit-tested, no database needed). Every value is fake and clearly labelled. */
function generateDemoConsumers(count = 200) {
  const pad = (n, w) => String(n).padStart(w, '0');
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      sn: `SN-${pad(n, 5)}`,
      pelcoMeterNumber: `DEMO-M-${pad(n, 6)}`,
      accountNumber: `DEMO${pad(n, 6)}`,
      poleNumber: `P-${pad((n * 7) % 900, 3)}`,
      pelcoSq: `SQ-${pad((n % 40) + 1, 2)}`,
      roverBook: `RB${pad((n % 25) + 1, 3)}`,
      accountName: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]} ${pad(n, 3)}`.toUpperCase(),
      status: n % 10 === 0 ? 'DISCONNECTED' : 'ACTIVE',
      address: `${100 + n} ${STREETS[i % STREETS.length]}, Demo City`.toUpperCase(),
      isHidden: false,
    };
  });
}

function generateDemoRoverBook(count = 25) {
  return Array.from({ length: count }, (_, i) => ({
    roverNumber: `RB${String(i + 1).padStart(3, '0')}`,
    address: `${100 + i} ${STREETS[i % STREETS.length]}, Demo City`.toUpperCase(),
  }));
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  const Consumer = require('../models/Consumer');
  const RoverBook = require('../models/RoverBook');

  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes. This script writes fake data to the database in MONGO_URI.');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const dbName = mongoose.connection.name;
  try {
    if (!/demo/i.test(dbName)) {
      console.error(`Refusing to seed database "${dbName}": its name must contain "demo". Create a separate demo database.`);
      process.exit(1);
    }
    const existing = await Consumer.estimatedDocumentCount();
    if (existing > 0) {
      console.error(`Database "${dbName}" already contains ${existing} consumers. Not touching it.`);
      process.exit(1);
    }
    await Consumer.insertMany(generateDemoConsumers(200));
    await RoverBook.insertMany(generateDemoRoverBook(25));
    console.log(`Seeded 200 fake consumers and 25 rover-book entries into "${dbName}".`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  });
}

module.exports = { generateDemoConsumers, generateDemoRoverBook };
