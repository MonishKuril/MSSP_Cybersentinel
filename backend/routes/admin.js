const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware, mainSuperAdminAuthMiddleware, adminOrSuperAdminAuthMiddleware } = require('../middleware/auth');
const clientsFilePath = path.join(__dirname, '../config/clients.js');

const getClients = () => {
  try {
    delete require.cache[require.resolve('../config/clients')];
    return require('../config/clients');
  } catch (error) {
    console.error('Error reading clients:', error);
    return [];
  }
};

const getSuperadmins = () => {
  try {
    delete require.cache[require.resolve('../config/superadmin')];
    return require('../config/superadmin');
  } catch (error) {
    console.error('Error reading superadmins:', error);
    // Create empty superadmin.js file if it doesn't exist
    const superadminFilePath = path.join(__dirname, '../config/superadmin.js');
    if (!fs.existsSync(superadminFilePath)) {
      fs.writeFileSync(superadminFilePath, 'module.exports = [];', 'utf8');
    }
    return [];
  }
};

const writeSuperadminsToFile = (superadmins) => {
  const superadminsFilePath = path.join(__dirname, '../config/superadmin.js');
  const superadminsContent = `module.exports = ${JSON.stringify(superadmins, null, 4)};`;
  fs.writeFileSync(superadminsFilePath, superadminsContent, 'utf8');
};

const writeClientsToFile = (clients) => {
  const clientsContent = `module.exports = ${JSON.stringify(clients, null, 4)};`;
  fs.writeFileSync(clientsFilePath, clientsContent, 'utf8');
};

///////////

const adminsFilePath = path.join(__dirname, '../config/admins.js');

const getAdmins = () => {
  try {
    delete require.cache[require.resolve('../config/admins')];
    return require('../config/admins');
  } catch (error) {
    console.error('Error reading admins:', error);
    return [];
  }
};

const writeAdminsToFile = (admins) => {
  const adminsContent = `module.exports = ${JSON.stringify(admins, null, 4)};`;
  fs.writeFileSync(adminsFilePath, adminsContent, 'utf8');
};

// Helper function to get next available suffix for environment variables
const getNextEnvSuffix = (prefix) => {
  let suffix = 1;
  while (process.env[`${prefix}_${suffix}`]) {
    suffix++;
  }
  return suffix;
};

// Helper function to check if superadmin exists in environment variables
const checkSuperadminExistsInEnv = (username) => {
  for (const key in process.env) {
    if (key.startsWith('SUPERADMIN_USERNAME_') && process.env[key] === username) {
      return true;
    }
  }
  return false;
};

////////////
// In your POST /clients route
router.post('/clients', [authMiddleware, adminOrSuperAdminAuthMiddleware], (req, res) => {
  try {
    const { name, url, description, graylog, logApi, adminId } = req.body;

    // For superadmin, use the provided adminId
    // For regular admin, use their own username
    const assignedAdminId = req.user.role === 'superadmin' && adminId
      ? adminId
      : req.user.username;

    const clients = getClients();
    const newId = clients.length > 0 ? Math.max(...clients.map(c => c.id)) + 1 : 1;

    const newClient = {
      id: newId,
      name,
      url,
      description: description || '',
      graylog: graylog || null,
      logApi: logApi || null,
      adminId: assignedAdminId
    };

    clients.push(newClient);
    writeClientsToFile(clients);
    res.status(201).json({ success: true, client: newClient });
  } catch (error) {
    console.error('Error adding client:', error);
    res.status(500).json({ success: false, message: 'Failed to add client' });
  }
});

router.put('/clients/:id', [authMiddleware, adminAuthMiddleware], (req, res) => {
  try {
    const { name, url, description, graylog, logApi } = req.body;
    const clientId = parseInt(req.params.id);

    if (!name || !url) {
      return res.status(400).json({ success: false, message: 'Name and URL are required' });
    }

    const clients = getClients();
    const clientIndex = clients.findIndex(c => c.id === clientId);

    if (clientIndex === -1) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    clients[clientIndex] = {
      ...clients[clientIndex],
      name,
      url,
      description: description || clients[clientIndex].description,
      graylog: graylog || clients[clientIndex].graylog || null,
      logApi: logApi || clients[clientIndex].logApi || null
    };

    writeClientsToFile(clients);
    res.json({ success: true, client: clients[clientIndex] });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ success: false, message: 'Failed to update client' });
  }
});

router.delete('/clients/:id', [authMiddleware, adminAuthMiddleware], (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const clients = getClients();
    const filteredClients = clients.filter(c => c.id !== clientId);

    if (filteredClients.length === clients.length) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    writeClientsToFile(filteredClients);
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ success: false, message: 'Failed to delete client' });
  }
});

router.post('/admins', [authMiddleware, superAdminAuthMiddleware], async (req, res) => {
  try {
    console.log('🔧 Creating new admin...');
    console.log('Request body:', req.body);
    
    const { username, password, name, email, organization, city, state } = req.body;
    if (!username || !password || !name || !email || !organization || !city || !state) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const dotenv = require('dotenv');
    const envPath = path.join(__dirname, '../.env');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));

    // Check if admin already exists in environment variables
    if (envConfig[`ADMIN_USERNAME_${username}`]) {
      console.log(`❌ Admin ${username} already exists in .env`);
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }

    // Check if admin already exists in admins.js (by email or name)
    const admins = getAdmins();
    const existingAdmin = admins.find(a => a.email === email || a.name === username);
    if (existingAdmin) {
      console.log(`❌ Admin with email ${email} or name ${username} already exists in admins.js`);
      return res.status(400).json({ success: false, message: 'Admin with this email or username already exists' });
    }

    // Create new admin credentials in .env
    const newEnvContent = `\nADMIN_USERNAME_${username}=${username}\nADMIN_PASSWORD_${username}=${password}\n`;
    fs.appendFileSync(envPath, newEnvContent, 'utf8');

    // Reload environment variables
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config();

    console.log(`✅ Added admin ${username} to .env`);

    // Add admin details to admins.js with blocked field
    const newAdmin = {
      id: admins.length > 0 ? Math.max(...admins.map(a => a.id)) + 1 : 1,
      name: username, // Use username as name for consistency
      email,
      organization,
      city,
      state,
      mfaSecret: null, // Will be set during first login
      blocked: false // Default to unblocked
    };

    admins.push(newAdmin);
    writeAdminsToFile(admins);

    console.log(`✅ Added admin details to admins.js`);

    res.status(201).json({
      success: true,
      message: 'Admin created successfully. They will need to setup MFA on first login.',
      admin: newAdmin
    });
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    res.status(500).json({ success: false, message: 'Failed to create admin' });
  }
});

router.get('/admins', [authMiddleware, superAdminAuthMiddleware], (req, res) => {
  try {
    const admins = getAdmins();
    if (!admins) {
      return res.status(404).json({ success: false, message: 'No admins found' });
    }
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admins' });
  }
});

/////////////

router.get('/admins/:adminId/clients', [authMiddleware, superAdminAuthMiddleware], (req, res) => {
  try {
    const { adminId } = req.params;
    const clients = getClients();
    const adminClients = clients.filter(client => client.adminId === adminId);

    res.json(adminClients);
  } catch (error) {
    console.error('Error fetching admin clients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin clients' });
  }
});

router.patch('/admins/:id/block', [authMiddleware, superAdminAuthMiddleware], (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const { blocked } = req.body;

    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Blocked status must be a boolean' });
    }

    const admins = getAdmins();
    const adminIndex = admins.findIndex(a => a.id === adminId);

    if (adminIndex === -1) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Update the blocked status
    admins[adminIndex].blocked = blocked;
    writeAdminsToFile(admins);

    res.json({
      success: true,
      message: `Admin ${blocked ? 'blocked' : 'unblocked'} successfully`,
      admin: admins[adminIndex]
    });
  } catch (error) {
    console.error('Error updating admin block status:', error);
    res.status(500).json({ success: false, message: 'Failed to update admin status' });
  }
});

router.get('/admins/:id', [authMiddleware, superAdminAuthMiddleware], (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const admins = getAdmins();
    const admin = admins.find(a => a.id === adminId);

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.json({ success: true, admin });
  } catch (error) {
    console.error('Error fetching admin:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin' });
  }
});

// FIXED: Superadmin creation route
router.post('/superadmins', [authMiddleware, mainSuperAdminAuthMiddleware], async (req, res) => {
  try {
    console.log('🔧 Creating new superadmin...');
    console.log('Request body:', req.body);
    
    const { username, password, name, email, organization, city, state } = req.body;
    
    if (!username || !password || !name || !email || !organization || !city || !state) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if superadmin already exists in environment variables (by username)
    if (checkSuperadminExistsInEnv(username)) {
      console.log(`❌ Superadmin ${username} already exists in environment variables`);
      return res.status(400).json({ success: false, message: 'Superadmin already exists' });
    }

    // Check if superadmin already exists in superadmin.js (by username or email)
    const superadmins = getSuperadmins();
    const existingSuperadmin = superadmins.find(s => s.username === username || s.email === email);
    if (existingSuperadmin) {
      console.log(`❌ Superadmin with username ${username} or email ${email} already exists in superadmin.js`);
      return res.status(400).json({ success: false, message: 'Superadmin with this username or email already exists' });
    }

    // Get next available suffix for environment variables
    const suffix = getNextEnvSuffix('SUPERADMIN_USERNAME');
    
    // Add to .env with unique suffix
    const envPath = path.join(__dirname, '../.env');
    const newEnvContent = `\nSUPERADMIN_USERNAME_${suffix}=${username}\nSUPERADMIN_PASSWORD_${suffix}=${password}\n`;
    fs.appendFileSync(envPath, newEnvContent, 'utf8');

    // Reload environment variables
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config();

    console.log(`✅ Added superadmin ${username} to .env with suffix ${suffix}`);

    // Add to superadmin.js
    const newSuperadmin = {
      id: superadmins.length > 0 ? Math.max(...superadmins.map(s => s.id)) + 1 : 1,
      username, // Store username for consistency
      name,
      email,
      organization,
      city,
      state,
      blocked: false,
      createdAt: new Date().toISOString()
    };
    
    superadmins.push(newSuperadmin);
    writeSuperadminsToFile(superadmins);

    console.log(`✅ Added superadmin details to superadmin.js`);

    res.status(201).json({
      success: true,
      message: 'Superadmin created successfully',
      superadmin: newSuperadmin
    });
  } catch (error) {
    console.error('❌ Error creating superadmin:', error);
    res.status(500).json({ success: false, message: 'Failed to create superadmin' });
  }
});

// Update the PUT /admins/:id route
router.put('/admins/:id', [authMiddleware, superAdminAuthMiddleware], async (req, res) => {
  try {
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    const adminId = parseInt(req.params.id);
    if (isNaN(adminId)) throw new Error('Invalid admin ID');

    const { name, email, organization, city, state } = req.body;
    if (!name || !email || !organization || !city || !state) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    const admins = getAdmins();
    const adminIndex = admins.findIndex(a => a.id === adminId);
    
    if (adminIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }

    // Update admin
    admins[adminIndex] = { ...admins[adminIndex], name, email, organization, city, state };
    writeAdminsToFile(admins);

    res.json({
      success: true,
      message: 'Admin updated successfully',
      admin: admins[adminIndex]
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// FIXED: Fetch superadmins route
router.get('/superadmins', [authMiddleware, mainSuperAdminAuthMiddleware], (req, res) => {
  try {
    console.log('🔍 Fetching superadmins...');
    
    const superadmins = [];
    const envVars = process.env;
    const superadminData = getSuperadmins();

    console.log('Available superadmin data from file:', superadminData);

    // Get all superadmin entries from environment variables
    for (const key in envVars) {
      if (key.startsWith('SUPERADMIN_USERNAME_')) {
        const suffix = key.replace('SUPERADMIN_USERNAME_', '');
        const username = envVars[key];
        
        console.log(`Found superadmin in env: ${username} (suffix: ${suffix})`);
        
        // Get corresponding superadmin details from superadmin.js
        const superadminDetails = superadminData.find(s => s.username === username);
        
        console.log(`Superadmin details for ${username}:`, superadminDetails);
        
        superadmins.push({
          username,
          name: superadminDetails?.name || 'N/A',
          email: superadminDetails?.email || 'N/A',
          organization: superadminDetails?.organization || 'N/A',
          city: superadminDetails?.city || 'N/A',
          state: superadminDetails?.state || 'N/A',
          blocked: superadminDetails?.blocked || false,
          createdAt: superadminDetails?.createdAt || new Date().toISOString()
        });
      }
    }

    console.log('Final superadmins list:', superadmins);
    res.json(superadmins);
  } catch (error) {
    console.error('❌ Error fetching superadmins:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch superadmins' });
  }
});

router.patch('/superadmins/:username/block', [authMiddleware, mainSuperAdminAuthMiddleware], (req, res) => {
  try {
    const { username } = req.params;
    const { blocked } = req.body;
    
    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid blocked status' });
    }
    
    // Update in superadmin.js
    const superadmins = getSuperadmins();
    const index = superadmins.findIndex(s => s.username === username);
    
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Superadmin not found' });
    }
    
    superadmins[index].blocked = blocked;
    writeSuperadminsToFile(superadmins);
    
    res.json({
      success: true,
      message: `Superadmin ${blocked ? 'blocked' : 'unblocked'} successfully`
    });
    
  } catch (error) {
    console.error('Error updating superadmin:', error);
    res.status(500).json({ success: false, message: 'Failed to update superadmin' });
  }
});

module.exports = router;