const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware,adminOrSuperAdminAuthMiddleware} = require('../middleware/auth');
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
    const { username, password, name, email, organization, city, state } = req.body;
    if (!username || !password || !name || !email || !organization || !city || !state) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const dotenv = require('dotenv');
    const envPath = path.join(__dirname, '../.env');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));

    // Check if admin already exists
    if (envConfig[`ADMIN_USERNAME_${username}`]) {
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }

    // Create new admin credentials in .env
    const newEnvContent = `
ADMIN_USERNAME_${username}=${username}
ADMIN_PASSWORD_${username}=${password}
`;

    fs.appendFileSync(envPath, newEnvContent, 'utf8');

    // Reload environment variables
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config();

    // Add admin details to admins.js with blocked field
    const admins = getAdmins();
    const newAdmin = {
      id: admins.length > 0 ? Math.max(...admins.map(a => a.id)) + 1 : 1,
      name,
      email,
      organization,
      city,
      state,
      mfaSecret: null, // Will be set during first login
      blocked: false // Default to unblocked
    };

    admins.push(newAdmin);
    writeAdminsToFile(admins);

    res.status(201).json({ 
      success: true, 
      message: 'Admin created successfully. They will need to setup MFA on first login.',
      admin: newAdmin
    });
  } catch (error) {
    console.error('Error creating admin:', error);
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



module.exports = router;