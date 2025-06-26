const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./routes/auth');
const clientsRoutes = require('./routes/clients');
const adminRoutes = require('./routes/admin');
const newsRoutes = require('./routes/news');
const { authMiddleware } = require('./middleware/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 7000;

// Configure helmet with minimal restrictions for development
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP completely for development
  crossOriginOpenerPolicy: false, // Disable to avoid COOP issues
  crossOriginResourcePolicy: false, // Disable to avoid CORP issues
  crossOriginEmbedderPolicy: false, // Disable COEP
  originAgentCluster: false, // Disable origin agent cluster
  referrerPolicy: false, // Disable referrer policy restrictions
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', authMiddleware, clientsRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/news', newsRoutes);

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, '../frontend/public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

app.use('/scripts', express.static(path.join(__dirname, '../frontend/scripts'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

app.use('/styles', express.static(path.join(__dirname, '../frontend/styles'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// Handle specific routes before the catch-all
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/dashboard.html'));
});

// Route all other requests to index.html (SPA fallback)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Access your app at: http://192.168.1.70:${PORT}`);
});

module.exports = app;
