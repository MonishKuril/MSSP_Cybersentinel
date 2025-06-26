// Self-executing function to hide from inspection
(function() {
    document.addEventListener('DOMContentLoaded', async () => {
        // Check authentication status
        try {
            const response = await fetch('/api/auth/check', {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.authenticated) {
                window.location.href = '/dashboard.html';
            } else {
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Auth check error:', error);
            window.location.href = '/login.html';
        }
    });
})();