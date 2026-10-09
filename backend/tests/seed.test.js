const { generateDemoConsumers, generateDemoRoverBook } = require('../scripts/seedDemoData');
const { sanitizeConsumer } = require('../utils/sanitizeConsumer');

describe('demo data generator', () => {
  const rows = generateDemoConsumers(200);

  test('produces the requested number of records with unique account numbers', () => {
    expect(rows).toHaveLength(200);
    expect(new Set(rows.map((r) => r.accountNumber)).size).toBe(200);
  });

  test('every record is clearly fake', () => {
    rows.forEach((r) => {
      expect(r.accountNumber).toMatch(/^DEMO/);
      expect(r.address).toMatch(/DEMO CITY$/);
    });
  });

  test('records pass through the real sanitizer unchanged (they match the schema)', () => {
    rows.forEach((r) => expect(sanitizeConsumer(r)).toEqual(r));
  });

  test('rover book entries line up with the consumers\' roverBook values', () => {
    const rover = new Set(generateDemoRoverBook(25).map((e) => e.roverNumber));
    rows.forEach((r) => expect(rover.has(r.roverBook)).toBe(true));
  });
});
