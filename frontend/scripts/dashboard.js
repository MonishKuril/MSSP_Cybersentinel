const clientHistory = {};
let newsTickerPaused = false;
let lastNewsUpdate = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Check authentication
  const authData = await window.__auth.checkAuth();
  if (!authData.authenticated) {
    window.location.href = "/login.html";
    return;
  }

  const role = authData.role;
  const userId = authData.username;

  // Update welcome message based on role
  const welcomeMessage = document.getElementById('welcomeMessage');
  if (role === 'superadmin') {
    welcomeMessage.textContent = 'Welcome Back, Super Admin!';
  } else {
    welcomeMessage.textContent = `Welcome Back, ${userId}!`;
  }

  // Initialize UI elements
  initializeUI();
  // Set up modal close handlers
  setupModalCloseHandlers();
  // Set up form submission handlers
  setupFormHandlers();
  // Load clients for desktop view
  await loadClients();
  // Leaderboard dashboard
  await updateLeaderboard();
  await loadAdminsAndClients();

  // News ticker
  initializeNewsTicker();
  setupTickerControls();

  // FIXED: Setup form handlers after DOM is loaded
  const addAdminForm = document.getElementById("addAdminForm");
  if (addAdminForm) {
    addAdminForm.addEventListener("submit", addAdminSubmitHandler);
  }

  const editAdminForm = document.getElementById("editAdminForm");
  if (editAdminForm) {
    editAdminForm.addEventListener("submit", editAdminSubmitHandler);
  }

  const editAdminCloseBtn = document.querySelector("#editAdminModal .admin-close-modal");
  const editAdminModal = document.getElementById("editAdminModal");
  if (editAdminCloseBtn && editAdminModal) {
    editAdminCloseBtn.addEventListener("click", function () {
      editAdminModal.classList.add("hidden");
    });
  }

  // FIXED: Add form handler for superadmin add client
  const superAdminAddClientForm = document.getElementById("superAdminAddClientForm");
  if (superAdminAddClientForm) {
    console.log('Setting up superAdminAddClientForm event listener');
    superAdminAddClientForm.addEventListener("submit", superAdminAddClientSubmitHandler);
  } else {
    console.error('superAdminAddClientForm not found in DOM');
  }

  // Initialize leaderboard toggle
  const toggleBtn = document.getElementById('leaderboardToggleBtn');
  const dropdown = document.getElementById('leaderboardDropdown');
  const arrow = toggleBtn.querySelector('.arrow');
  
  if (toggleBtn && dropdown) {
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('visible');
      dropdown.classList.toggle('hidden');
      
      arrow.textContent = dropdown.classList.contains('visible') ? '▲' : '▼';
      
      if (dropdown.classList.contains('visible')) {
        updateLeaderboard();
      }
    });
    
    document.addEventListener('click', function() {
      if (dropdown.classList.contains('visible')) {
        dropdown.classList.remove('visible');
        dropdown.classList.add('hidden');
        arrow.textContent = '▼';
      }
    });

    dropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
});

function initializeUI() {
  // Navigation and action buttons
  document
    .getElementById("logoutButton")
    .addEventListener("click", window.__auth.logout);
  document
    .getElementById("refreshBtn")
    .addEventListener("click", () => window.location.reload());
  document
    .getElementById("manageClientsBtn")
    .addEventListener("click", toggleManagementView);
  document
    .getElementById("addClientBtn")
    .addEventListener("click", showAddClientModal);
  document
    .getElementById("addAdminBtn")
    .addEventListener("click", showAddAdminModal);

  // Add search functionality
  document.getElementById("searchClientBtn").addEventListener("click", searchClient);
  document.getElementById("clientSearch").addEventListener("keyup", function (e) {
      if (e.key === "Enter") searchClient();
    });

  // FIXED: Use event delegation for dynamically created buttons
  document.addEventListener('click', function(e) {
    // Handle "New Client" buttons for admins
    if (e.target.classList.contains('add-client-btn')) {
      e.preventDefault();
      e.stopPropagation();
      const adminId = e.target.dataset.adminId;
      const adminUsername = e.target.dataset.adminUsername;
      console.log('Add client button clicked for admin:', adminId, adminUsername);
      showSuperAdminAddClientModal(adminId, adminUsername);
    }
    
    // Handle Open Dashboard buttons in search results
    if (e.target.closest(".view-client-btn")) {
      const clientCard = e.target.closest(".client-card");
      if (clientCard) {
        const url = clientCard.dataset.url;
        if (url) window.open(url, "_blank");
      }
    }
  });

  document.querySelector(".close-popup").addEventListener("click", closeSearchPopup); 
}

document.addEventListener("DOMContentLoaded", function () {
    const closeBtn = document.querySelector(".admin-close-modal");
    const modal = document.getElementById("addAdminModal");

    closeBtn.addEventListener("click", function () {
      modal.classList.add("hidden");
    });
  });
function setupModalCloseHandlers() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  });
  document.querySelectorAll(".close-modal").forEach((closeBtn) => {
    closeBtn.addEventListener("click", function () {
      this.closest(".modal").classList.add("hidden");
    });
  });
}
function setupFormHandlers() {
  const addClientForm = document.getElementById("addClientForm");
  if (addClientForm) {
    addClientForm.addEventListener("submit", addClientSubmitHandler);
  }
  const editClientForm = document.getElementById("editClientForm");
  if (editClientForm) {
    editClientForm.addEventListener("submit", editClientSubmitHandler);
  }
}
async function loadClients() {
  const dashboardGrid = document.getElementById("dashboardView");
  if (!dashboardGrid) return;
  dashboardGrid.innerHTML = '<div class="loading">Loading clients...</div>';
  try {
    const response = await fetch("/api/clients", { credentials: "include" });
    if (!response.ok) throw new Error("Failed to load clients");
    const clients = await response.json();
    if (clients.length === 0) {
      dashboardGrid.innerHTML =
        '<div class="no-clients">No clients found. Click "Manage Clients" to add clients.</div>';
      return;
    }
    dashboardGrid.innerHTML = "";
    for (const client of clients) {
      let logCount = "Loading...";
      let lastActive = "Just now";
      const clientCard = document.createElement("div");
      clientCard.className = "client-card";
      clientCard.dataset.clientId = client.id;
      clientCard.innerHTML = `
                <div class="client-card-header">
                    <div class="client-icon" style="background: ${getRandomColor()}">
                        ${client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="client-name">${escapeHtml(
                          client.name
                        )}</div>
                        <div class="client-url">${escapeHtml(client.url)}</div>
                    </div>
                </div>
                <div class="client-description">
                    ${escapeHtml(
                      client.description || "No description available"
                    )}
                </div>
                    
                <div class="client-status">
                    <span>
                        <span class="status-indicator status-active"></span>
                        <span class="status-text">Active</span>
                    </span>
                    <span class="log-count-wrapper">
                        Logs (10s): <span class="log-count">0</span>
                    </span>
                </div>
  
                <!-- Current Log Graph -->
                <div class="log-graph-container">
                    <div class="log-graph">
                        <div class="graph-bar" style="width: 0%"></div>
                        <div class="timer-line"></div>
                    </div>
                    <div class="graph-labels">
                        <span>0</span>
                        <span>50</span>
                        <span>100+</span>
                    </div>
                </div>
                    
                      <div class="client-stats-container">
                        <div class="stat-item">
                            <span class="stat-label">Total Logs:</span>
                            <span class="stat-value total-logs">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Major:</span>
                            <span class="stat-value major-logs">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Normal:</span>
                            <span class="stat-value normal-logs">0</span>
                        </div>
                    </div>

                <!-- Historical Log Graph (Last 60 seconds) -->
                <div class="history-graph">
                    <div class="graph-labels" style="padding-bottom: 5px;">
                        <span>Logs (Last 60s)</span>
                        <span class="history-average">Avg: 0</span>
                    </div>
                    <div class="history-bars" id="historyGraph-${client.id}">
                        <!-- Bars will be added dynamically -->
                    </div>
                </div><br>
                    
                <div class="client-status">
                    <span>Last active: Just now</span>
                    <span class="last-updated">Updating...</span>
                </div>     
            `;
      ////////

      /////////////
      function getRandomColor() {
        const colors = [
          "linear-gradient(135deg, #3498db, #2ecc71)",
          "linear-gradient(135deg, #e74c3c, #f39c12)",
          "linear-gradient(135deg, #9b59b6, #3498db)",
          "linear-gradient(135deg, #1abc9c, #2ecc71)",
          "linear-gradient(135deg, #f1c40f, #e67e22)",
        ];
        return colors[Math.floor(Math.random() * colors.length)];
      }

      const historyGraph = clientCard.querySelector(
        `#historyGraph-${client.id}`
      );
      for (let i = 0; i < 12; i++) {
        const bar = document.createElement("div");
        bar.className = "history-bar";
        bar.style.height = "0%";
        bar.dataset.count = "0";
        historyGraph.appendChild(bar);
      }

      clientCard.addEventListener("click", () => openClientDashboard(client));
      dashboardGrid.appendChild(clientCard);
      // Fetch log count for this client
      fetchLogCount(client.id);
    }
    setInterval(refreshAllLogCounts, 10000);
  } catch (error) {
    console.error("Error loading clients:", error);
    dashboardGrid.innerHTML =
      '<div class="error">Error loading clients. Click Refresh to try again.</div>';
  }
}
async function fetchLogCount(clientId) {
  try {
    const response = await fetch(`/api/clients/${clientId}/logs`, {
      credentials: "include",
    });

    if (!response.ok)
      throw new Error(`Failed to load logs for client ${clientId}`);

    const data = await response.json();
    if (data.success) {
      const clientCard = document.querySelector(
        `.client-card[data-client-id="${clientId}"]`
      );
      if (clientCard) {
        // Update current log count
        const logCount = data.logCount || 0;
        const logCountElement = clientCard.querySelector(".log-count");
        const graphBar = clientCard.querySelector(".graph-bar");

        if (logCountElement) {
          logCountElement.textContent = logCount;
        }

        if (graphBar) {
          const percentage = Math.min(100, logCount);
          graphBar.style.width = `${percentage}%`;
        }

        // Update historical data
        if (!clientHistory[clientId]) {
          clientHistory[clientId] = [];
        }

        clientHistory[clientId].push(logCount);
        if (clientHistory[clientId].length > 12) {
          clientHistory[clientId].shift();
        }

        // Calculate average
        const avg = Math.round(
          clientHistory[clientId].reduce((a, b) => a + b, 0) /
            clientHistory[clientId].length
        );
        clientCard.querySelector(
          ".history-average"
        ).textContent = `Avg: ${avg}`;

        // Update history graph
        const historyBars = clientCard.querySelectorAll(".history-bar");
        const maxValue = Math.max(...clientHistory[clientId], 1); // Avoid division by zero

        clientHistory[clientId].forEach((count, index) => {
          if (historyBars[index]) {
            const height = Math.min(100, (count / maxValue) * 100);
            historyBars[index].style.height = `${height}%`;
            historyBars[index].dataset.count = count;
          }

          ///////////////

          /////////////
        });

        // Update timestamp
        const lastUpdatedElement = clientCard.querySelector(".last-updated");
        if (lastUpdatedElement) {
          const now = new Date();
          lastUpdatedElement.textContent = `Updated: ${now.toLocaleTimeString(
            [],
            { hour: "2-digit", minute: "2-digit" }
          )}`;
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching log count for client ${clientId}:`, error);
    const clientCard = document.querySelector(
      `.client-card[data-client-id="${clientId}"]`
    );
    if (clientCard) {
      const statusIndicator = clientCard.querySelector(".status-indicator");
      const statusText = clientCard.querySelector(".status-text");
      const logCountElement = clientCard.querySelector(".log-count");

      if (statusIndicator) {
        statusIndicator.classList.remove("status-active");
        statusIndicator.classList.add("status-inactive");
      }

      if (statusText) {
        statusText.textContent = "Connection Error";
      }

      if (logCountElement) {
        logCountElement.textContent = "Error";
      }
    }
  }
  ////////////////
  if (!clientId) {
    console.error("Invalid clientId:", clientId);
    return;
  }

  try {
    // Fetch and display the new log stats
    const statsResponse = await fetchLogStats(clientId);
    const clientCard = document.querySelector(
      `.client-card[data-client-id="${clientId}"]`
    );

    if (statsResponse?.success && clientCard) {
      const stats = statsResponse.stats || {};
      clientCard.querySelector(".total-logs").textContent = stats.total || 0;
      clientCard.querySelector(".major-logs").textContent = stats.major || 0;
      clientCard.querySelector(".normal-logs").textContent = stats.normal || 0;
    } else if (!statsResponse?.success && clientCard) {
      // Optional: Show error state for stats
      clientCard.querySelector(".total-logs").textContent = "N/A";
      clientCard.querySelector(".major-logs").textContent = "N/A";
      clientCard.querySelector(".normal-logs").textContent = "N/A";
    }
  } catch (error) {
    console.error(`Error in fetchLogCount for client ${clientId}:`, error);
  }
}
///////////////

function refreshAllLogCounts() {
  const clientCards = document.querySelectorAll(".client-card");
  clientCards.forEach((card) => {
    const clientId = card.dataset.clientId;
    if (clientId) {
      fetchLogCount(parseInt(clientId));
    }
  });
  updateLeaderboard();
}

function openClientDashboard(client) {
  // Directly open the client's dashboard in a new tab
  window.open(client.url, "_blank");
}

// Add this updated function to replace the existing loadAdminsAndClients function
async function loadAdminsAndClients() {
  const tableBody = document.getElementById("adminsTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="9">Loading admins and clients...</td></tr>';

  try {
    const [adminsResponse, clientsResponse] = await Promise.all([
      fetch("/api/admin/admins", { credentials: "include" }),
      fetch("/api/clients", { credentials: "include" })
    ]);

    if (!adminsResponse.ok || !clientsResponse.ok) throw new Error("Failed to load data");

    const admins = await adminsResponse.json();
    const allClients = await clientsResponse.json();

    // Log data for debugging
    console.log("Admins:", admins);
    console.log("All Clients:", allClients);

    tableBody.innerHTML = "";
    
    admins.forEach(admin => {
      // Try multiple matching strategies to find clients for this admin
      let adminClients = [];
      
      // Strategy 1: Match by admin.username
      adminClients = allClients.filter(client => client.adminId === admin.username);
      
      // Strategy 2: If no clients found, try matching by admin.id
      if (adminClients.length === 0) {
        adminClients = allClients.filter(client => client.adminId === admin.id);
      }
      
      // Strategy 3: If still no clients, try matching by admin.name
      if (adminClients.length === 0) {
        adminClients = allClients.filter(client => client.adminId === admin.name);
      }
      
      console.log(`Admin ${admin.username || admin.name} has ${adminClients.length} clients:`, adminClients);
      
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${admin.id}</td>
        <td>${admin.name}</td>
        <td>${admin.email}</td>
        <td>${admin.organization}</td>
        <td>${admin.city}</td>
        <td>${admin.state}</td>
        <td>
          <select class="admin-clients-dropdown" data-admin-id="${admin.id}" data-admin-username="${admin.username || admin.name}">
            ${adminClients.length > 0 ? 
              adminClients.map(client => `
                <option value="${client.id}" data-url="${client.url}" data-client-name="${client.name}">
                  ${client.name}
                </option>
              `).join('') : '<option value="" disabled selected>No clients assigned</option>'}
          </select>
        </td>
        <td class="admin-status ${admin.blocked ? 'blocked' : 'active'}">
          ${admin.blocked ? 'Blocked' : 'Active'}
        </td>
        <td class="table-actions">
          <button class="table-btn add-client-btn" data-admin-id="${admin.id}" data-admin-username="${admin.username || admin.name}">New Client</button>
          <button class="table-btn edit-admin-btn" data-admin-id="${admin.id}">Edit Admin</button>
          <button class="table-btn block-admin-btn" 
                  data-admin-id="${admin.id}" 
                  data-blocked="${admin.blocked}">
            ${admin.blocked ? 'Unblock' : 'Block'}
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });

     document.querySelectorAll('.admin-clients-dropdown').forEach(dropdown => {
      dropdown.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value && selectedOption.dataset.url) {
          console.log('Opening client:', selectedOption.dataset.clientName, selectedOption.dataset.url);
          window.open(selectedOption.dataset.url, "_blank");
          // Reset to default option after opening
          this.selectedIndex = 0;
        }
      });
    });

    document.querySelectorAll('.block-admin-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const adminId = this.dataset.adminId;
        const isBlocked = this.dataset.blocked === 'true';
        toggleAdminBlock(adminId, isBlocked);
      });
    });

    document.querySelectorAll('.view-admin-client-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const adminId = this.dataset.adminId;
        const clientId = this.parentElement.previousElementSibling.querySelector('select').value;
        await viewAdminClient(adminId, clientId);
      });
    });

    document.querySelectorAll('.edit-admin-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const adminId = this.dataset.adminId;
        showEditAdminModal(adminId);
      });
    });

  } catch (error) {
    console.error("Error loading admins:", error);
    tableBody.innerHTML =
      '<tr><td colspan="8">Error loading admins. Try refreshing the page.</td></tr>';
  }
}

// Add toggleAdminBlock function
async function toggleAdminBlock(adminId, isBlocked) {
  if (!confirm(`Are you sure you want to ${isBlocked ? 'unblock' : 'block'} this admin?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/admins/${adminId}/block`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ blocked: !isBlocked })
    });

    const data = await response.json();
    if (data.success) {
      showMessage(`Admin ${!isBlocked ? 'blocked' : 'unblocked'} successfully`, 'success');
      // Update UI without reloading
      const btn = document.querySelector(`.block-admin-btn[data-admin-id="${adminId}"]`);
      const statusCell = btn.closest('tr').querySelector('.admin-status');
      
      btn.dataset.blocked = !isBlocked;
      btn.textContent = isBlocked ? 'Block' : 'Unblock';
      
      statusCell.textContent = isBlocked ? 'Active' : 'Blocked';
      statusCell.className = `admin-status ${isBlocked ? 'active' : 'blocked'}`;
    } else {
      showMessage(data.message || 'Failed to update admin status', 'error');
    }
  } catch (error) {
    console.error('Error toggling admin block status:', error);
    showMessage('Error updating admin status', 'error');
  }
}
// Function to show the Add Client modal (you should already have this in your dashboard.js)
function showAddClientModal() {
  const modal = document.getElementById("addClientModal");
  const form = document.getElementById("addClientForm");
  
  // Reset form and clear any adminId field if it exists
  form.reset();
  const adminIdField = document.getElementById("clientAdminId");
  if (adminIdField) adminIdField.value = "";
  
  modal.classList.remove("hidden");
}
function showEditClientModal(client) {
  const modal = document.getElementById("editClientModal");
  
  // Populate basic client info
  document.getElementById("editClientId").value = client.id;
  document.getElementById("editClientName").value = client.name || '';
  document.getElementById("editClientUrl").value = client.url || '';
  document.getElementById("editClientDescription").value = client.description || '';
  
  // Populate Graylog config if it exists
  if (client.graylog) {
    document.getElementById("editGraylogHost").value = client.graylog.host || '';
    document.getElementById("editGraylogUsername").value = client.graylog.username || '';
    document.getElementById("editGraylogPassword").value = client.graylog.password || '';
    document.getElementById("editGraylogStreamId").value = client.graylog.streamId || '';
  }
  
  // Populate Log API config if it exists
  if (client.logApi) {
    document.getElementById("editLogApiHost").value = client.logApi.host || '';
    document.getElementById("editLogApiUsername").value = client.logApi.username || '';
    document.getElementById("editLogApiPassword").value = client.logApi.password || '';
  }
  
  // Show the modal
  modal.classList.remove("hidden");
}
async function addClientSubmitHandler(e) {
  e.preventDefault();
  const name = document.getElementById("clientName").value.trim();
  const url = document.getElementById("clientUrl").value.trim();
  const description = document.getElementById("clientDescription").value.trim();

  // Get graylog config
  const graylogHost = document.getElementById("graylogHost").value.trim();
  const graylogUsername = document.getElementById("graylogUsername").value.trim();
  const graylogPassword = document.getElementById("graylogPassword").value.trim();
  const graylogStreamId = document.getElementById("graylogStreamId").value.trim();

  // Get logApi config
  const logApiHost = document.getElementById("logApiHost").value.trim();
  const logApiUsername = document.getElementById("logApiUsername").value.trim();
  const logApiPassword = document.getElementById("logApiPassword").value.trim();

  const graylog = graylogHost ? {
    host: graylogHost,
    username: graylogUsername,
    password: graylogPassword,
    streamId: graylogStreamId
  } : null;

  const logApi = logApiHost ? {
    host: logApiHost,
    username: logApiUsername,
    password: logApiPassword
  } : null;

  if (!name || !url) {
    showMessage("Name and URL are required", "error");
    return;
  }

  try {
    const response = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, url, description, graylog, logApi }),
    });

    const data = await response.json();
    if (data.success) {
      showMessage("Client added successfully", "success");
      document.getElementById("addClientModal").classList.add("hidden");
      await loadClients();
      if (!document.getElementById("managementView").classList.contains("hidden")) {
        await loadClientsTable();
      }
    } else {
      showMessage(data.message || "Failed to add client", "error");
    }
  } catch (error) {
    console.error("Error adding client:", error);
    showMessage("Error adding client", "error");
  }
}
// Update editClientSubmitHandler
async function editClientSubmitHandler(e) {
  e.preventDefault();
  const id = document.getElementById("editClientId").value;
  const name = document.getElementById("editClientName").value.trim();
  const url = document.getElementById("editClientUrl").value.trim();
  const description = document.getElementById("editClientDescription").value.trim();

  // Get graylog config
  const graylogHost = document.getElementById("editGraylogHost").value.trim();
  const graylogUsername = document.getElementById("editGraylogUsername").value.trim();
  const graylogPassword = document.getElementById("editGraylogPassword").value.trim();
  const graylogStreamId = document.getElementById("editGraylogStreamId").value.trim();

  // Get logApi config
  const logApiHost = document.getElementById("editLogApiHost").value.trim();
  const logApiUsername = document.getElementById("editLogApiUsername").value.trim();
  const logApiPassword = document.getElementById("editLogApiPassword").value.trim();

  const graylog = graylogHost ? {
    host: graylogHost,
    username: graylogUsername,
    password: graylogPassword,
    streamId: graylogStreamId
  } : null;

  const logApi = logApiHost ? {
    host: logApiHost,
    username: logApiUsername,
    password: logApiPassword
  } : null;

  if (!name || !url) {
    showMessage("Name and URL are required", "error");
    return;
  }

  try {
    const response = await fetch(`/api/admin/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, url, description, graylog, logApi }),
    });

    const data = await response.json();
    if (data.success) {
      showMessage("Client updated successfully", "success");
      document.getElementById("editClientModal").classList.add("hidden");
      await loadClients();
      if (!document.getElementById("managementView").classList.contains("hidden")) {
        await loadClientsTable();
      }
    } else {
      showMessage(data.message || "Failed to update client", "error");
    }
  } catch (error) {
    console.error("Error updating client:", error);
    showMessage("Error updating client", "error");
  }
}

function showMessage(message, type = "info") {
  const messageElement = document.getElementById("message");
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
    messageElement.classList.remove("hidden");
    // Hide after 3 seconds
    setTimeout(() => {
      messageElement.classList.add("hidden");
    }, 3000);
  } else {
    alert(message);
  }
}
async function loadClientsTable() {
  const clientsTableBody = document.getElementById("clientsTableBody");
  if (!clientsTableBody) {
    console.error("Clients table body not found");
    return;
  }

  clientsTableBody.innerHTML = '<tr><td colspan="4">Loading clients...</td></tr>';

  try {
    const response = await fetch("/api/clients", { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load clients");
    }

    const clients = await response.json();
    if (clients.length === 0) {
      clientsTableBody.innerHTML =
        '<tr><td colspan="4">No clients found. Click "Add New Client" to add clients.</td></tr>';
      return;
    }

    clientsTableBody.innerHTML = "";
    clients.forEach(client => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${client.name}</td>
      <td>${client.url}</td>
      <td>${client.description || 'No description'}</td>
      <td class="table-actions">
        <button class="table-btn view-client-btn" data-client-id="${client.id}">View</button>
        <button class="table-btn edit-client-btn" data-client-id="${client.id}">Edit</button>
        <button class="table-btn delete-client-btn" data-client-id="${client.id}">Delete</button>
      </td>
    `;
    clientsTableBody.appendChild(row);
  });

    // Add event listeners for client actions
    document.querySelectorAll('.view-client-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const clientId = this.dataset.clientId;
        openClientDashboard(clientId);
      });
    });

    document.querySelectorAll('.edit-client-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const clientId = this.dataset.clientId;
      try {
        const response = await fetch(`/api/clients/${clientId}`, {
          credentials: "include"
        });
        if (response.ok) {
          const client = await response.json();
          showEditClientModal(client);
        } else {
          throw new Error('Failed to fetch client details');
        }
      } catch (error) {
        console.error('Error fetching client details:', error);
        showMessage('Error loading client details', 'error');
      }
    });
  });

    document.querySelectorAll('.delete-client-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const clientId = this.dataset.clientId;
        deleteClient(clientId);
      });
    });
  } catch (error) {
    console.error("Error loading clients:", error);
    clientsTableBody.innerHTML =
      '<tr><td colspan="4">Error loading clients. Try refreshing the page.</td></tr>';
  }
}
/* Leaderboard section */
// Add this function to dashboard.js
function updateLeaderboard() {
  const leaderboardList = document.getElementById("leaderboardList");
  if (!leaderboardList) return;

  // Create an array of clients with their average counts
  const leaderboardData = [];
  for (const clientId in clientHistory) {
    const clientCard = document.querySelector(
      `.client-card[data-client-id="${clientId}"]`
    );
    if (clientCard) {
      const name = clientCard.querySelector(".client-name").textContent;
      const avg = parseInt(
        clientCard
          .querySelector(".history-average")
          .textContent.replace("Avg: ", "")
      );
      leaderboardData.push({ clientId, name, avg });
    }
  }

  // Sort by average count (descending)
  leaderboardData.sort((a, b) => b.avg - a.avg);

  // Update the leaderboard UI with top 3 servers
  leaderboardList.innerHTML = "";
  leaderboardData.slice(0, 3).forEach((client, index) => {
    const item = document.createElement("div");
    item.className = "leaderboard-item";
    item.innerHTML = `
            <div class="leaderboard-rank">${index + 1}</div>
            <div class="leaderboard-name" title="${client.name}">${
      client.name
    }</div>
            <div class="leaderboard-count">${client.avg}</div>
        `;
    leaderboardList.appendChild(item);
  });
}

///////////////////
 
// Search function
async function searchClient() {
  const searchTerm = document.getElementById("clientSearch").value.trim();
  if (!searchTerm) return;

  try {
    const clients = await fetchClients();
    const foundClient = clients.find((client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const popup = document.getElementById("clientSearchPopup");
    const resultsContainer = document.getElementById("searchResults");

    if (foundClient) {
      // Create a copy of the desktop icon with data-url attribute
      resultsContainer.innerHTML = `
        <div class="client-card" data-url="${escapeHtml(
          foundClient.url
        )}" style="margin: 0; width: 100%">
          <div class="client-card-header">
            <div class="client-icon" style="background: ${getRandomColor()}">
              ${foundClient.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="client-name">${escapeHtml(foundClient.name)}</div>
              <div class="client-url">${escapeHtml(foundClient.url)}</div>
            </div>
          </div>
          <div class="client-description">
            ${escapeHtml(foundClient.description || "No description available")}
          </div>
          <div class="client-status">
            <span class="status-indicator status-active"></span>
            <span class="status-text">Active</span>
          </div>
          <button class="view-client-btn">
            Open Dashboard
          </button>
        </div>
      `;
    } else {
      resultsContainer.innerHTML = `
        <div class="not-found-message">
          Client "${escapeHtml(searchTerm)}" not found
        </div>
      `;
    }

    popup.classList.remove("hidden");
  } catch (error) {
    console.error("Search error:", error);
    showMessage("Error searching for client", "error");
  }
}
function closeSearchPopup() {
  document.getElementById("clientSearchPopup").classList.add("hidden");
}

// Helper function to fetch clients
async function fetchClients() {
  const response = await fetch("/api/clients", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch clients");
  return await response.json();
}

// Helper function to prevent XSS
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

///////////
// At the top of dashboard.js, after 'const clientHistory = {};'
async function fetchLogStats(clientId) {
  if (!clientId) {
    console.error("fetchLogStats called without clientId");
    return null;
  }

  try {
    const response = await fetch(`/api/clients/${clientId}/logstats`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    if (!data) throw new Error("Empty response");
    return data;
  } catch (error) {
    console.error(`Error fetching log stats for client ${clientId}:`, error);
    return null;
  }
}

///////////

// News Ticker Functions
async function initializeNewsTicker() {
  console.log('Initializing news ticker...');
  try {
    await updateNewsTicker();
    startTickerAnimation();
    
    // Update news every 5 minutes
    setInterval(async () => {
      if (!newsTickerPaused) {
        await updateNewsTicker();
      }
    }, 5 * 60 * 1000);
    
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
  } catch (error) {
    console.error('Failed to initialize news ticker:', error);
    showFallbackNews();
  }
}

async function updateNewsTicker() {
  console.log('Updating news ticker...');
  try {
    const response = await fetch('/api/news/scrape', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('News data received:', data);
    
    const tickerContent = document.querySelector('.ticker-content');
    if (!tickerContent) {
      throw new Error('Ticker content element not found');
    }
    
    // Clear existing content
    tickerContent.innerHTML = '';
    
    // Add news items
    data.news.forEach(item => {
      const newsElement = document.createElement('a');
      newsElement.className = 'ticker-item';
      newsElement.href = item.url;
      newsElement.target = '_blank';
      newsElement.textContent = item.title;
      tickerContent.appendChild(newsElement);
      
      const separator = document.createElement('span');
      separator.className = 'ticker-separator';
      separator.textContent = ' ••• ';
      tickerContent.appendChild(separator);
    });
    
    // Clone for seamless looping
    tickerContent.innerHTML += tickerContent.innerHTML;
    
    // Update footer info
    document.getElementById('newsSource').textContent = `Source: ${data.source || 'Local'}`;
    lastNewsUpdate = new Date();
    
  } catch (error) {
    console.error('Error updating news ticker:', error);
    showFallbackNews();
  }
}

function showFallbackNews() {
  const tickerContent = document.querySelector('.ticker-content');
  if (tickerContent) {
    tickerContent.innerHTML = `
      <a href="#" class="ticker-item">SIEM Dashboard: Latest security updates</a>
      <span class="ticker-separator"> ••• </span>
      <a href="#" class="ticker-item">Cybersecurity monitoring in progress</a>
      <span class="ticker-separator"> ••• </span>
    `;
    tickerContent.innerHTML += tickerContent.innerHTML;
    document.getElementById('newsSource').textContent = 'Source: Local Cache';
  }
}

function startTickerAnimation() {
  const ticker = document.querySelector('.news-ticker');
  if (ticker) {
    ticker.classList.remove('ticker-paused');
  }
}

function stopTickerAnimation() {
  const ticker = document.querySelector('.news-ticker');
  if (ticker) {
    ticker.classList.add('ticker-paused');
  }
}

function updateCurrentTime() {
  try {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString();
  } catch (error) {
    console.error('Error updating time:', error);
  }
}

function setupTickerControls() {
  document.getElementById('pauseTickerBtn')?.addEventListener('click', () => {
    newsTickerPaused = !newsTickerPaused;
    if (newsTickerPaused) {
      stopTickerAnimation();
      document.getElementById('pauseTickerBtn').textContent = '▶';
      document.getElementById('pauseTickerBtn').title = 'Play';
    } else {
      startTickerAnimation();
      document.getElementById('pauseTickerBtn').textContent = '⏸';
      document.getElementById('pauseTickerBtn').title = 'Pause';
    }
  });
  
  document.getElementById('refreshNewsBtn')?.addEventListener('click', async () => {
    try {
      document.getElementById('refreshNewsBtn').textContent = '⌛';
      await updateNewsTicker();
    } finally {
      document.getElementById('refreshNewsBtn').textContent = '⟳';
    }
  });
}


async function toggleManagementView() {
  const desktopView = document.getElementById("dashboardView");
  const managementView = document.getElementById("managementView");
  const superAdminView = document.getElementById("superAdminView");
  
  if (desktopView.classList.contains("hidden")) {
    // Switch to desktop view
    managementView.classList.add("hidden");
    superAdminView.classList.add("hidden");
    desktopView.classList.remove("hidden");
    document.getElementById("manageClientsBtn").innerHTML =
      "<span>⚙</span> Manage Clients";
  } else {
    const authData = await window.__auth.checkAuth();
    if (authData.role === 'superadmin') {
      desktopView.classList.add("hidden");
      managementView.classList.add("hidden");
      superAdminView.classList.remove("hidden");
      document.getElementById("manageClientsBtn").innerHTML =
        "<span>⌂</span> Desktop View";
      loadAdminsAndClients();
    } else {
      desktopView.classList.add("hidden");
      managementView.classList.remove("hidden");
      superAdminView.classList.add("hidden");
      document.getElementById("manageClientsBtn").innerHTML =
        "<span>⌂</span> Desktop View";
      loadClientsTable();
    }
  }
}

function showAddAdminModal() {
  const modal = document.getElementById("addAdminModal");
  const form = document.getElementById("addAdminForm");
  if (form) {
    form.reset(); // Reset form
  }
  modal.classList.remove("hidden"); // Show modal
}

async function addAdminSubmitHandler(e) {
  e.preventDefault();
  const username = document.getElementById("adminUsername").value.trim();
  const password = document.getElementById("adminPassword").value.trim();
  const name = document.getElementById("adminName").value.trim();
  const email = document.getElementById("adminEmail").value.trim();
  const organization = document.getElementById("adminOrganization").value.trim();
  const city = document.getElementById("adminCity").value.trim();
  const state = document.getElementById("adminState").value.trim();

  if (!username || !password || !name || !email || !organization || !city || !state) {
    showMessage("All fields are required", "error");
    return;
  }

  try {
    const response = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password, name, email, organization, city, state }),
    });

    const data = await response.json();
    if (data.success) {
      showMessage("Admin added successfully", "success");
      document.getElementById("addAdminModal").classList.add("hidden");
      loadAdminsAndClients();
    } else {
      showMessage(data.message || "Failed to add admin", "error");
    }
  } catch (error) {
    console.error("Error adding admin:", error);
    showMessage("Error adding admin", "error");
  }
}

// Function to show edit admin modal
async function showEditAdminModal(adminId) {
  try {
    // Fetch admin details
    const response = await fetch(`/api/admin/admins/${adminId}`, {
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error('Failed to fetch admin details');
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch admin details');
    }

    const admin = data.admin;
    
    // Populate the form fields
    document.getElementById("editAdminId").value = admin.id;
    document.getElementById("editAdminName").value = admin.name || '';
    document.getElementById("editAdminEmail").value = admin.email || '';
    document.getElementById("editAdminOrganization").value = admin.organization || '';
    document.getElementById("editAdminCity").value = admin.city || '';
    document.getElementById("editAdminState").value = admin.state || '';

    // Show the modal
    document.getElementById("editAdminModal").classList.remove("hidden");
    
  } catch (error) {
    console.error('Error loading admin details:', error);
    showMessage('Error loading admin details', 'error');
  }
}

// Function to handle edit admin form submission
async function editAdminSubmitHandler(e) {
  e.preventDefault();
  
  const adminId = document.getElementById("editAdminId").value;
  const name = document.getElementById("editAdminName").value.trim();
  const email = document.getElementById("editAdminEmail").value.trim();
  const organization = document.getElementById("editAdminOrganization").value.trim();
  const city = document.getElementById("editAdminCity").value.trim();
  const state = document.getElementById("editAdminState").value.trim();

  if (!name || !email || !organization || !city || !state) {
    showMessage("All fields are required", "error");
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showMessage("Please enter a valid email address", "error");
    return;
  }

  try {
    const response = await fetch(`/api/admin/admins/${adminId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, organization, city, state }),
    });

    const data = await response.json();
    if (data.success) {
      showMessage("Admin updated successfully", "success");
      document.getElementById("editAdminModal").classList.add("hidden");
      // Refresh the admins table
      await loadAdminsAndClients();
    } else {
      showMessage(data.message || "Failed to update admin", "error");
    }
  } catch (error) {
    console.error("Error updating admin:", error);
    showMessage("Error updating admin", "error");
  }
}


function showSuperAdminAddClientModal(adminId, adminUsername) {
  console.log('showSuperAdminAddClientModal called with:', adminId, adminUsername);
  
  const modal = document.getElementById('superAdminAddClientModal');
  const form = document.getElementById('superAdminAddClientForm');
  
  if (!modal) {
    console.error('superAdminAddClientModal not found');
    return;
  }
  
  if (!form) {
    console.error('superAdminAddClientForm not found');
    return;
  }
  
  // Set the admin ID in the hidden field
  const adminIdField = document.getElementById('superAdminClientAdminId');
  if (adminIdField) {
    adminIdField.value = adminId || adminUsername;
    console.log('Set admin ID field to:', adminIdField.value);
  } else {
    console.error('superAdminClientAdminId field not found');
  }
  
  // Reset form
  form.reset();
  
  // Set the admin ID again after reset (in case reset cleared it)
  if (adminIdField) {
    adminIdField.value = adminId || adminUsername;
  }
  
  // Show modal
  modal.classList.remove('hidden');
  console.log('Modal should now be visible');
}
async function superAdminAddClientSubmitHandler(e) {
  e.preventDefault();
  
  const adminId = document.getElementById('superAdminClientAdminId').value;
  const name = document.getElementById('superAdminClientName').value.trim();
  const url = document.getElementById('superAdminClientUrl').value.trim();
  const description = document.getElementById('superAdminClientDescription').value.trim();

  // Get graylog config
  const graylogHost = document.getElementById('superAdminGraylogHost').value.trim();
  const graylogUsername = document.getElementById('superAdminGraylogUsername').value.trim();
  const graylogPassword = document.getElementById('superAdminGraylogPassword').value.trim();
  const graylogStreamId = document.getElementById('superAdminGraylogStreamId').value.trim();

  // Get logApi config
  const logApiHost = document.getElementById('superAdminLogApiHost').value.trim();
  const logApiUsername = document.getElementById('superAdminLogApiUsername').value.trim();
  const logApiPassword = document.getElementById('superAdminLogApiPassword').value.trim();

  const graylog = graylogHost ? {
    host: graylogHost,
    username: graylogUsername,
    password: graylogPassword,
    streamId: graylogStreamId
  } : null;

  const logApi = logApiHost ? {
    host: logApiHost,
    username: logApiUsername,
    password: logApiPassword
  } : null;

  if (!name || !url || !adminId) {
    showMessage("Name, URL and Admin ID are required", "error");
    return;
  }

  try {
    const response = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ 
        name, 
        url, 
        description, 
        graylog, 
        logApi,
        adminId 
      }),
    });

    const data = await response.json();
    if (data.success) {
      showMessage("Client added successfully", "success");
      document.getElementById("superAdminAddClientModal").classList.add("hidden");
      await loadAdminsAndClients();
    } else {
      showMessage(data.message || "Failed to add client", "error");
    }
  } catch (error) {
    console.error("Error adding client:", error);
    showMessage("Error adding client", "error");
  }
}