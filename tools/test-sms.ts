#!/usr/bin/env node

/**
 * Manual SMS test script for AfrikSMS
 * 
 * Usage:
 *   npm run sms:test -- --phone=228XXXXXXXX
 *   SMS_TEST_PHONE=228XXXXXXXX npm run sms:test
 * 
 * This script sends a test OTP via AfrikSMS without being part of automated tests.
 * NEVER include this in CI/CD pipelines.
 * NEVER hardcode phone numbers or credentials.
 */

import { AfrikSmsProvider } from '../src/modules/notifications/AfrikSmsProvider.js';
import { env } from '../src/config/env.js';
import { afriksmsConfig } from '../src/config/otp.js';

async function main() {
  try {
    // Verify credentials are configured
    if (!env.SMS_CLIENT_ID || !env.SMS_API_KEY || !env.SMS_SENDER_ID) {
      console.error('❌ Error: SMS credentials not configured.');
      console.error('Please set SMS_CLIENT_ID, SMS_API_KEY, and SMS_SENDER_ID in your .env file.');
      process.exit(1);
    }

    // Get phone number from CLI or environment
    const phoneArg = process.argv.find((arg) => arg.startsWith('--phone='))?.split('=')[1];
    const phoneEnv = process.env['SMS_TEST_PHONE'];
    const phone = phoneArg || phoneEnv;

    if (!phone) {
      console.error('❌ Error: Phone number not provided.');
      console.error('Usage: npm run sms:test -- --phone=228XXXXXXXX');
      console.error('Or set SMS_TEST_PHONE environment variable.');
      process.exit(1);
    }

    console.log('📱 Testing AfrikSMS integration...\n');
    console.log(`Phone: ${phone}`);
    console.log(`Sender: ${env.SMS_SENDER_ID}`);
    console.log(`API Base URL: ${afriksmsConfig.baseUrl}`);

    // Create provider instance
    const provider = new AfrikSmsProvider(afriksmsConfig);

    // Generate test OTP
    const testCode = Math.floor(100000 + Math.random() * 900000).toString();

    console.log(`\n🔄 Sending test OTP: ${testCode}...`);

    // Send OTP
    await provider.sendOtp(phone, testCode);

    console.log('✅ SMS sent successfully!');
    console.log(`\n📧 Message sent to: ${phone}`);
    console.log(`📝 Code: ${testCode}`);
    console.log(`⏱️  Message expires in: 5 minutes`);
  } catch (error) {
    console.error('❌ Error sending SMS:');
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      if (process.env['DEBUG'] === 'true') {
        console.error(`  ${error.stack}`);
      }
    } else {
      console.error(`  ${String(error)}`);
    }
    process.exit(1);
  }
}

main();
