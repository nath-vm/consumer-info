// Runs before every test file. Values are throw-away test values, never real credentials.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.MONGO_URI = 'mongodb://localhost:27017/not-used-in-tests';
process.env.SMTP_USER = 'noreply@example.com';
