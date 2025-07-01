const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

// Helper function to get admins
const getAdmins = () => {
  try {
    delete require.cache[require.resolve('../config/admins')];
    return require('../config/admins');
  } catch (error) {
    console.error('Error reading admins:', error);
    return [];
  }
};

// Helper function to check if admin is blocked
const isAdminBlocked = (username) => {
  const admins = getAdmins();
  const admin = admins.find(a => a.email === username || a.name === username);
  return admin ? admin.blocked : false;
};

const authMiddleware = (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if admin is blocked (skip for superadmin and main-superadmin)
    if (decoded.role === 'admin' && isAdminBlocked(decoded.username)) {
      res.clearCookie('token');
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked by the administrator. Please contact support.',
        blocked: true
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid authentication' });
  }
};

const adminAuthMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'You are not authorized to perform this action' });
  }
  next();
};

const superAdminAuthMiddleware = (req, res, next) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'main-superadmin') {
    return res.status(403).json({ success: false, message: 'You are not authorized to perform this action' });
  }
  next();
};

const mainSuperAdminAuthMiddleware = (req, res, next) => {
  if (req.user.role !== 'main-superadmin') {
    return res.status(403).json({ success: false, message: 'You are not authorized to perform this action' });
  }
  next();
};

const adminOrSuperAdminAuthMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'You are not authorized to perform this action' });
  }
  next();
};

module.exports = {
  authMiddleware,
  adminAuthMiddleware,
  superAdminAuthMiddleware,
  mainSuperAdminAuthMiddleware,
  isAdminBlocked,
  adminOrSuperAdminAuthMiddleware
};