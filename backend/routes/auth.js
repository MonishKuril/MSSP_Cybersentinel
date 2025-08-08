const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const getAdmins = () => {
  try {
    delete require.cache[require.resolve('../config/admins')];
    return require('../config/admins');
  } catch (error) {
    console.error('Error reading admins:', error);
    return [];
  }
};

const isAdminBlocked = (username) => {
  const admins = getAdmins();
  const admin = admins.find(a => a.email === username || a.name === username);
  return admin ? admin.blocked : false;
};

// Generate backup codes
const generateBackupCodes = () => {
  return Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
};

// Check if user has MFA setup - Enhanced with debug logging
const checkMFASetup = (username) => {
  const mfaSecret = process.env[`MFA_SECRET_${username}`];
  console.log(`🔍 Checking MFA setup for ${username}:`);
  console.log(`   - MFA Secret exists: ${!!mfaSecret}`);
  console.log(`   - Looking for env var: MFA_SECRET_${username}`);
  
  // Additional debug: check all MFA-related env vars
  const mfaEnvVars = Object.keys(process.env).filter(key => key.startsWith('MFA_SECRET_'));
  console.log(`   - Available MFA secrets: ${mfaEnvVars.join(', ')}`);
  
  return !!mfaSecret;
};

// Setup MFA for user
router.post('/setup-mfa', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'Username required' });
  }

  try {
    console.log(`🔧 Setting up MFA for username: ${username}`);
    
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `MSSP Console (${username})`,
      issuer: 'MSSP Console'
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // Store secret and backup codes in .env
    const envPath = path.join(__dirname, '../.env');
    const envContent = `\nMFA_SECRET_${username}=${secret.base32}\nMFA_BACKUP_${username}=${backupCodes.join(',')}\n`;
    fs.appendFileSync(envPath, envContent, 'utf8');

    // Reload environment variables
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config();

    console.log(`✅ MFA setup complete for ${username}`);

    res.json({
      success: true,
      qrCode: qrCodeUrl,
      backupCodes: backupCodes,
      secret: secret.base32
    });
  } catch (error) {
    console.error('❌ MFA setup error:', error);
    res.status(500).json({ success: false, message: 'Failed to setup MFA' });
  }
});

// Verify MFA token - Enhanced with debug logging
const verifyMFAToken = (username, token) => {
  console.log(`🔐 Verifying MFA token for ${username}`);
  
  const secret = process.env[`MFA_SECRET_${username}`];
  const backupCodes = process.env[`MFA_BACKUP_${username}`];

  console.log(`   - Secret exists: ${!!secret}`);
  console.log(`   - Backup codes exist: ${!!backupCodes}`);

  if (!secret) {
    console.log(`❌ No MFA secret found for ${username}`);
    return false;
  }

  // Check TOTP token
  const verified = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2
  });

  if (verified) {
    console.log(`✅ TOTP verified for ${username}`);
    return true;
  }

  // Check backup codes
  if (backupCodes && backupCodes.includes(token.toUpperCase())) {
    console.log(`✅ Backup code verified for ${username}`);
    // Remove used backup code
    const updatedCodes = backupCodes.split(',').filter(code => code !== token.toUpperCase());
    updateEnvVariable(`MFA_BACKUP_${username}`, updatedCodes.join(','));
    return true;
  }

  console.log(`❌ MFA verification failed for ${username}`);
  return false;
};

// Update environment variable
const updateEnvVariable = (key, value) => {
  const envPath = path.join(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  delete require.cache[require.resolve('dotenv')];
  require('dotenv').config();
};

router.post('/login', (req, res) => {
  const { username, password, role, totpCode } = req.body;

  console.log('🚀 Login attempt started');
  console.log(`   - Username: ${username}`);
  console.log(`   - Has Password: ${!!password}`);
  console.log(`   - Has TOTP Code: ${!!totpCode}`);
  console.log(`   - Requested Role: ${role || 'auto-detect'}`);

  // Auto-detect role based on credentials
  let detectedRole = null;
  let validCredentials = false;

  // Check main-superadmin first
  console.log('🔍 Checking main-superadmin credentials...');
  console.log(`   - Expected username: ${process.env.MAIN_SUPERADMIN_USERNAME}`);
  console.log(`   - Provided username: ${username}`);
  console.log(`   - Username match: ${username === process.env.MAIN_SUPERADMIN_USERNAME}`);
  console.log(`   - Password match: ${password === process.env.MAIN_SUPERADMIN_PASSWORD}`);

  if (username === process.env.MAIN_SUPERADMIN_USERNAME && password === process.env.MAIN_SUPERADMIN_PASSWORD) {
    console.log('✅ Main superadmin credentials matched');
    detectedRole = 'main-superadmin';
    validCredentials = true;
  }
  // Check secondary superadmins
  else {
    console.log('🔍 Checking secondary superadmins...');
    // Get all superadmin env vars for debugging
    const superAdminEnvVars = Object.keys(process.env).filter(key => key.startsWith('SUPERADMIN_USERNAME_'));
    console.log(`   - Available superadmin usernames: ${superAdminEnvVars.join(', ')}`);
    
    // Check all SUPERADMIN_USERNAME_* environment variables
    for (const key in process.env) {
      if (key.startsWith('SUPERADMIN_USERNAME_')) {
        const suffix = key.replace('SUPERADMIN_USERNAME_', '');
        const superAdminUsername = process.env[key];
        const superAdminPassword = process.env[`SUPERADMIN_PASSWORD_${suffix}`];

        console.log(`   - Checking ${suffix}: username=${superAdminUsername}, password exists=${!!superAdminPassword}`);

        if (username === superAdminUsername && password === superAdminPassword) {
          console.log(`✅ Secondary superadmin credentials matched for ${suffix}`);
          detectedRole = 'superadmin';
          validCredentials = true;
          break;
        }
      }
    }
  }

  // Check regular admins if not found above
  if (!validCredentials) {
    console.log('🔍 Checking regular admin credentials...');
    
    // Check if admin is blocked BEFORE validating credentials
    if (isAdminBlocked(username)) {
      console.log(`❌ Admin ${username} is blocked`);
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked by the administrator. Please contact support.',
        blocked: true
      });
    }

    // Check legacy admin credentials
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      console.log('✅ Legacy admin credentials matched');
      detectedRole = 'admin';
      validCredentials = true;
    } else {
      // Check new admin credentials
      const adminEnvVars = Object.keys(process.env).filter(key => key.startsWith('ADMIN_USERNAME_'));
      console.log(`   - Available admin usernames: ${adminEnvVars.join(', ')}`);
      
      for (const key in process.env) {
        if (key.startsWith('ADMIN_USERNAME_')) {
          const suffix = key.replace('ADMIN_USERNAME_', '');
          const adminUsername = process.env[key];
          const adminPassword = process.env[`ADMIN_PASSWORD_${suffix}`];

          console.log(`   - Checking ${suffix}: username=${adminUsername}, password exists=${!!adminPassword}`);

          if (username === adminUsername && password === adminPassword) {
            console.log(`✅ New admin credentials matched for ${suffix}`);
            detectedRole = 'admin';
            validCredentials = true;
            break;
          }
        }
      }
    }
  }

  if (!validCredentials) {
    console.log('❌ No valid credentials found');
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  console.log(`✅ Valid credentials found, detected role: ${detectedRole}`);

  // Check MFA setup
  const hasMFA = checkMFASetup(username);

  if (!hasMFA) {
    console.log(`⚠️  MFA setup required for ${username}`);
    return res.json({
      success: true,
      requireMFASetup: true,
      message: "MFA setup required"
    });
  }

  // Verify MFA token
  if (!totpCode) {
    console.log(`⚠️  MFA token required for ${username}`);
    return res.json({
      success: true,
      requireMFAToken: true,
      message: "MFA token required"
    });
  }

  if (!verifyMFAToken(username, totpCode)) {
    console.log(`❌ Invalid MFA token for ${username}`);
    return res.status(401).json({ success: false, message: "Invalid MFA token" });
  }

  // Generate JWT token with detected role
  console.log(`🔑 Generating JWT token for ${username} with role ${detectedRole}`);
  
  const token = jwt.sign(
    { username, role: detectedRole },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  });

  console.log(`🎉 Login successful for ${username} with role ${detectedRole}`);
  res.json({ success: true, message: "Login successful", role: detectedRole });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: "Logout successful" });
});

router.get('/check', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authenticated: true, role: decoded.role, username: decoded.username });
  } catch (error) {
    res.clearCookie('token');
    res.json({ authenticated: false });
  }
});

module.exports = router;