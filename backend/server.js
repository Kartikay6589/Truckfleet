const path = require('path');
// Load backend/.env explicitly (not process.cwd()/.env) so this still works
// whether the app is started from the backend/ folder or the repo root.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

require('./db'); // creates tables on first run

const app = express();
app.use(cors());
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

/* ── Serve the frontend static files from the parent directory ── */
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
