// Test script — run with: node test-email.mjs
import nodemailer from 'nodemailer';

const GMAIL_USER = 'yahya.lebbar13@gmail.com';
const GMAIL_APP_PASSWORD = 'goaqptrilxzeznvy'; // spaces removed

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

console.log('🔌 Testing SMTP connection...');
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP connection FAILED:', err.message);
    console.error('Full error:', err);
  } else {
    console.log('✅ SMTP connection OK — sending test email...');
    transporter.sendMail({
      from: `"LEBTEX Test" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      subject: '✅ Test Notification LEBTEX',
      text: 'Si vous recevez cet email, les notifications Gmail fonctionnent correctement!',
    }, (sendErr, info) => {
      if (sendErr) {
        console.error('❌ Send FAILED:', sendErr.message);
      } else {
        console.log('✅ Email sent successfully!');
        console.log('   Message ID:', info.messageId);
        console.log('   Response:', info.response);
      }
    });
  }
});
