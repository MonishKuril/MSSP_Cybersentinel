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

// Check if user has MFA setup
const checkMFASetup = (username, role) => {
  const mfaSecret = process.env[`MFA_SECRET_${username}`];
  return !!mfaSecret;
};

// Setup MFA for user
router.post('/setup-mfa', async (req, res) => {
  const { username, role } = req.body;
  
  if (!username || !role) {
    return res.status(400).json({ success: false, message: 'Username and role required' });
  }

  try {
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

    res.json({
      success: true,
      qrCode: qrCodeUrl,
      backupCodes: backupCodes,
      secret: secret.base32
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ success: false, message: 'Failed to setup MFA' });
  }
});

// Verify MFA token
const verifyMFAToken = (username, token) => {
  const secret = process.env[`MFA_SECRET_${username}`];
  const backupCodes = process.env[`MFA_BACKUP_${username}`];
  
  if (!secret) return false;
  
  // Check TOTP token
  const verified = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2
  });
  
  if (verified) return true;
  
  // Check backup codes
  if (backupCodes && backupCodes.includes(token.toUpperCase())) {
    // Remove used backup code
    const updatedCodes = backupCodes.split(',').filter(code => code !== token.toUpperCase());
    updateEnvVariable(`MFA_BACKUP_${username}`, updatedCodes.join(','));
    return true;
  }
  
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

  // Validate credentials
  let validCredentials = false;
  if (role === 'superadmin') {
    validCredentials = username === process.env.SUPERADMIN_USERNAME && password === process.env.SUPERADMIN_PASSWORD;
  } else if (role === 'admin') {
    // Check if admin is blocked BEFORE validating credentials
    if (isAdminBlocked(username)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been blocked by the administrator. Please contact support.',
        blocked: true 
      });
    }

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      validCredentials = true;
    } else {
      const adminUsername = process.env[`ADMIN_USERNAME_${username}`];
      const adminPassword = process.env[`ADMIN_PASSWORD_${username}`];
      validCredentials = username === adminUsername && password === adminPassword;
    }
  }

  if (!validCredentials) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  // Check MFA setup
  const hasMFA = checkMFASetup(username, role);
  
  if (!hasMFA) {
    return res.json({ 
      success: true, 
      requireMFASetup: true,
      message: "MFA setup required" 
    });
  }

  // Verify MFA token
  if (!totpCode) {
    return res.json({ 
      success: true, 
      requireMFAToken: true,
      message: "MFA token required" 
    });
  }

  if (!verifyMFAToken(username, totpCode)) {
    return res.status(401).json({ success: false, message: "Invalid MFA token" });
  }

  // Generate JWT token
  const token = jwt.sign(
    { username, role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  });

  res.json({ success: true, message: "Login successful" });
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