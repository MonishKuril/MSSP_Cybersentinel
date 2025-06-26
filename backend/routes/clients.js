
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { authMiddleware } = require('../middleware/auth');

const getClients = () => {
  try {
    return require('../config/clients');
  } catch (error) {
    console.error('Error reading clients:', error);
    return [];
  }
};

router.get('/', authMiddleware, (req, res) => {
  try {
    const clients = getClients();
    if (req.user.role === 'superadmin') {
      res.json(clients);
    } else {
      const adminClients = clients.filter(client => client.adminId === req.user.username);
      res.json(adminClients);
    }
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch clients' });
  }
});

router.get('/:id', authMiddleware, (req, res) => {
  try {
    const clients = getClients();
    const client = clients.find(c => c.id === parseInt(req.params.id));
    
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (req.user.role === 'admin' && client.adminId !== req.user.username) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this client' });
    }
    
    res.json(client);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch client' });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const clients = getClients();
    const client = clients.find(c => c.id === parseInt(req.params.id));
    
    if (!client || !client.graylog) {
      return res.status(404).json({ success: false, message: 'Client or Graylog config not found' });
    }
    
    const graylog = client.graylog;
    const fromDate = new Date();
    fromDate.setSeconds(fromDate.getSeconds() - 10); // 10 seconds ago
    
    const toDate = new Date(); // now
    
    // Format dates for Graylog API
    const fromFormatted = fromDate.toISOString();
    const toFormatted = toDate.toISOString();
    
    // Build URL for Graylog API request
    const apiUrl = `http://${graylog.host}/api/search/universal/absolute?query=*&from=${fromFormatted}&to=${toFormatted}&limit=0&filter=streams:${graylog.streamId}`;
    
    // Create auth header
    const auth = Buffer.from(`${graylog.username}:${graylog.password}`).toString('base64');
    
    // Make the HTTP request to Graylog
    const requestOptions = {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    };
    
    // Promise wrapper for HTTP request
    const fetchGraylogData = () => {
      return new Promise((resolve, reject) => {
        const req = http.get(apiUrl, requestOptions, (response) => {
          let data = '';
          
          response.on('data', (chunk) => {
            data += chunk;
          });
          
          response.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Failed to parse Graylog response'));
            }
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.end();
      });
    };
    
    const graylogResponse = await fetchGraylogData();
    
    res.json({
      success: true,
      clientId: client.id,
      clientName: client.name,
      logCount: graylogResponse.total_results || 0,
      timeRange: {
        from: fromFormatted,
        to: toFormatted
      }
    });
    
  } catch (error) {
    console.error('Error fetching Graylog data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch log data' });
  }
});

router.get('/:id/logstats', async (req, res) => {
  try {
    const clients = getClients();
    const client = clients.find(c => c.id === parseInt(req.params.id));
    
    if (!client || !client.logApi) {
      return res.status(404).json({ success: false, message: 'Client or Log API config not found' });
    }

    // First, get the token
    const tokenResponse = await fetch(`http://${client.logApi.host}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: client.logApi.username,
        password: client.logApi.password
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.token) {
      throw new Error('Failed to get authentication token');
    }

    // Then get the log stats
    const statsResponse = await fetch(`http://${client.logApi.host}/api/logs/stats/overview?timeRange=24h`, {
      headers: {
        'Authorization': `Bearer ${tokenData.token}`,
        'Content-Type': 'application/json'
      }
    });

    const statsData = await statsResponse.json();
    res.json({
      success: true,
      stats: statsData
    });
    
  } catch (error) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch log statistics' });
  }
});

module.exports = router;