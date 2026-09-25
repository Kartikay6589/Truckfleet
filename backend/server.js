const path = require('path');
// Load backend/.env explicitly (not process.cwd()/.env) so this still works
// whether the app is started from the backend/ folder or the repo root.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const db = require('./db');

const app = express();

// The frontend (Vercel) and this API (Render) live on different domains, so
// CORS has to explicitly allow the frontend's origin. Set CORS_ORIGIN to your
// Vercel URL (e.g. https://your-app.vercel.app) in production; comma-separate
// multiple origins. Defaults to "*" (fine here — auth uses a bearer token,
// not cookies, so an open CORS policy doesn't expose sessions to other sites).
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins
}));
app.use(express.json());

/* ── Twilio (SMS OTP) ── */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient;
if (accountSid && authToken && accountSid !== 'your_account_sid_here') {
  twilioClient = twilio(accountSid, authToken);
} else {
  console.warn('Twilio credentials not fully set. SMS will not be sent, but OTP will be generated in console.');
}

// In-memory store for OTPs (fine for one server process; use Redis if you scale to more than one)
const otpStore = {};
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/send-otp', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  const otp = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  otpStore[phoneNumber] = { otp, expiresAt };

  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `Your TruckFleet Pro verification code is: ${otp}`,
        from: twilioPhoneNumber,
        to: phoneNumber
      });
      console.log(`OTP ${otp} sent to ${phoneNumber}`);
      res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
      console.error('Twilio Error:', error);
      res.status(500).json({ success: false, message: 'Failed to send OTP SMS' });
    }
  } else {
    console.log(`[LOCAL DEV] OTP for ${phoneNumber} is: ${otp}`);
    res.json({ success: true, message: 'OTP generated', mockOtp: otp });
  }
});

app.post('/api/verify-otp', (req, res) => {
  const { phoneNumber, otp } = req.body;
  if (!phoneNumber || !otp) {
    return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
  }

  const storedData = otpStore[phoneNumber];
  if (!storedData) {
    return res.status(400).json({ success: false, message: 'No OTP requested for this number' });
  }
  if (Date.now() > storedData.expiresAt) {
    delete otpStore[phoneNumber];
    return res.status(400).json({ success: false, message: 'OTP has expired' });
  }
  if (storedData.otp === otp) {
    delete otpStore[phoneNumber];
    res.json({ success: true, message: 'OTP verified successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid OTP' });
  }
});

/* ── Real data API — every account's data lives here, not in the browser ── */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/broker-trips', require('./routes/brokerTrips'));
app.use('/api/notifications', require('./routes/notifications'));

/* ── Serve the frontend static files from the parent directory ──
   Handy for local dev (one server, one origin). In production the frontend
   is deployed separately on Vercel, so this is just a convenience fallback. */
app.use(express.static(path.join(__dirname, '..')));

/* ── JSON error handler ──
   Any route above that throws (e.g. a database error) lands here instead of
   Express's default HTML error page. Keeps the API's contract — every
   response is JSON with a `success` field — and never leaks a stack trace. */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong on the server. Please try again.' });
});

const PORT = process.env.PORT || 3000;

db.ready()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to the database. Check DATABASE_URL in backend/.env:', err.message);
    process.exit(1);
  });
