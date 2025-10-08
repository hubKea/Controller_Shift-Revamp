// Centralized Login Logic for Thinkers Afrika Shift Report System
import { auth } from '../firebase-config.js';
import { signInWithPopup, OAuthProvider, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { userService } from './user-service.js';

// Microsoft OAuth Provider
const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({
  tenant: '9b0f483f-fde4-429e-bf68-b070e583e58e' // Your specific Microsoft 365 Tenant ID
});

// Check for existing authentication on page load
let redirectInProgress = false;

onAuthStateChanged(auth, async (user) => {
  console.log('🔍 onAuthStateChanged triggered on login page:', user ? user.email : 'null');
  
  if (user && !redirectInProgress) {
    console.log('✅ User already authenticated:', user.email);
    redirectInProgress = true;
    
    try {
      // Get user role and redirect
      const userRole = await userService.getUserRole(user.uid);
      console.log('👤 User role:', userRole);
      
      if (userRole === 'manager') {
        console.log('🚀 Redirecting to manager dashboard...');
        window.location.href = 'dashboard-manager.html';
      } else {
        console.log('🚀 Redirecting to controller dashboard...');
        window.location.href = 'dashboard-controller.html';
      }
    } catch (error) {
      console.error('❌ Error getting user role:', error);
      // If there's an error getting the role, still redirect to controller dashboard
      console.log('🚀 Redirecting to controller dashboard (fallback)...');
      window.location.href = 'dashboard-controller.html';
    }
  } else if (!user) {
    console.log('❌ No user authenticated, staying on login page');
    redirectInProgress = false;
  }
});

// Microsoft Sign-in
document.getElementById('microsoftSignIn').addEventListener('click', async () => {
  try {
    showLoading('Signing in with Microsoft 365...');
    const result = await signInWithPopup(auth, microsoftProvider);
    console.log('Microsoft sign-in successful:', result.user);
    
    // Don't redirect here - let onAuthStateChanged handle it
    hideLoading();
    showSuccess('Signed in successfully! Redirecting...');
    
  } catch (error) {
    console.error('Microsoft sign-in error:', error);
    hideLoading();
    showError('Sign-in failed: ' + error.message);
  }
});

// Show loading state
function showLoading(message) {
  const loadingEl = document.getElementById('loginMessage');
  if (loadingEl) {
    loadingEl.textContent = message;
    loadingEl.className = 'p-4 rounded-xl text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200';
    loadingEl.classList.remove('hidden');
  }
  
  // Disable Microsoft sign-in button
  const microsoftBtn = document.getElementById('microsoftSignIn');
  if (microsoftBtn) {
    microsoftBtn.disabled = true;
    microsoftBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

// Hide loading state
function hideLoading() {
  const loadingEl = document.getElementById('loginMessage');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }
  
  // Re-enable Microsoft sign-in button
  const microsoftBtn = document.getElementById('microsoftSignIn');
  if (microsoftBtn) {
    microsoftBtn.disabled = false;
    microsoftBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

// Show success message
function showSuccess(message) {
  showMessage(message, 'success');
}

// Show error message
function showError(message) {
  showMessage(message, 'error');
}

// Show message
function showMessage(message, type) {
  const messageEl = document.getElementById('loginMessage');
  if (messageEl) {
    const colors = {
      success: 'bg-green-100 text-green-800 border border-green-200',
      error: 'bg-red-100 text-red-800 border border-red-200',
      info: 'bg-blue-100 text-blue-800 border border-blue-200'
    };

    messageEl.className = `p-4 rounded-xl text-sm font-medium ${colors[type] || colors.info}`;
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (messageEl) {
        messageEl.classList.add('hidden');
      }
    }, 5000);
  }
}
