require('dotenv').config();
const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const k of required) if (!process.env[k]) { console.error(`Missing ${k} in .env (see .env.example)`); process.exit(1); }
module.exports = {
  port: Number(process.env.PORT || 4000),
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', 'uploads'),
  exotel: {
    sid: process.env.EXOTEL_SID, key: process.env.EXOTEL_API_KEY, token: process.env.EXOTEL_API_TOKEN,
    subdomain: process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com', callerId: process.env.EXOTEL_CALLER_ID
  }
};
