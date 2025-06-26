(function () {
  let currentUser = null;
  let mfaSetupData = null;

  const loginForm = document.getElementById('loginForm');
  const mfaSetupModal = document.getElementById('mfaSetupModal');
  const totpGroup = document.getElementById('totpGroup');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const role = document.getElementById('role').value;
      const totpCode = document.getElementById('totpCode').value;

      if (!username || !password || !role) {
        showMessage('Please fill in all fields');
        return;
      }

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ username, password, role, totpCode })
        });

        const data = await response.json();

        if (data.success) {
          if (data.requireMFASetup) {
            currentUser = { username, password, role };
            await setupMFA();
          } else if (data.requireMFAToken) {
            showTOTPInput();
            showMessage('Enter your 6-digit authentication code');
          } else {
            window.location.href = '/dashboard.html';
          }
        } else {
          if (data.blocked) {
            showMessage('Your account has been blocked by the administrator. Please contact support.');
          } else {
            showMessage(data.message || 'Login failed');
          }
        }
      } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed. Please try again.');
      }
    });
  }
  
  async function setupMFA() {
    try {
      const response = await fetch('/api/auth/setup-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: currentUser.username, 
          role: currentUser.role 
        })
      });

      const data = await response.json();
      if (data.success) {
        mfaSetupData = data;
        showMFASetupModal(data);
      } else {
        showMessage('Failed to setup MFA');
      }
    } catch (error) {
      console.error('MFA setup error:', error);
      showMessage('Failed to setup MFA');
    }
  }

  function showMFASetupModal(data) {
    const qrContainer = document.getElementById('qrCodeContainer');
    const backupContainer = document.getElementById('backupCodesContainer');
    
    // Display QR code
    qrContainer.innerHTML = `<img src="${data.qrCode}" alt="QR Code" style="max-width: 200px;" />`;
    
    // Display backup codes
    const backupCodesHtml = data.backupCodes.map(code => 
      `<span class="backup-code">${code}</span>`
    ).join('');
    backupContainer.innerHTML = backupCodesHtml;
    
    mfaSetupModal.classList.remove('hidden');
    
    // Setup verify button
    document.getElementById('verifyMfaBtn').onclick = verifyMFASetup;
    
    // Setup download backup codes
    document.getElementById('downloadBackupCodes').onclick = () => {
      downloadBackupCodes(data.backupCodes);
    };
  }

  async function verifyMFASetup() {
    const verifyCode = document.getElementById('verifyMfaCode').value;
    if (!verifyCode || verifyCode.length !== 6) {
      showMessage('Please enter a valid 6-digit code');
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          username: currentUser.username,
          password: currentUser.password,
          role: currentUser.role,
          totpCode: verifyCode
        })
      });

      const data = await response.json();
      if (data.success) {
        mfaSetupModal.classList.add('hidden');
        window.location.href = '/dashboard.html';
      } else {
        showMessage('Invalid verification code');
      }
    } catch (error) {
      console.error('MFA verification error:', error);
      showMessage('Verification failed');
    }
  }

  function showTOTPInput() {
    totpGroup.classList.remove('hidden');
    document.getElementById('totpCode').focus();
  }

  function downloadBackupCodes(codes) {
    const content = `MSSP Console - Backup Codes\n\nUsername: ${currentUser.username}\nGenerated: ${new Date().toISOString()}\n\nBackup Codes:\n${codes.join('\n')}\n\nKeep these codes safe and secure!`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MSSP_BackupCodes_${currentUser.username}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  function showMessage(message) {
    const messageElement = document.getElementById('message');
    if (messageElement) {
      messageElement.textContent = message;
      messageElement.style.display = 'block';
    } else {
      alert(message);
    }
  }
})();

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/check', {
      credentials: 'include'
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Auth check error:', error);
    return { authenticated: false };
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Logout error:', error);
    alert('Logout failed');
  }
}

window.__auth = {
  checkAuth: checkAuth,
  logout: logout
};