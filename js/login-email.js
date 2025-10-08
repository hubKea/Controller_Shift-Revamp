import { auth } from '../firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { userService } from './user-service.js';

let redirectInProgress = false;

onAuthStateChanged(auth, async (user) => {
  console.log('Email login onAuthStateChanged:', user ? user.email : 'null');

  if (user && !redirectInProgress) {
    redirectInProgress = true;

    try {
      const userRole = await userService.getUserRole(user.uid);
      if (userRole === 'manager') {
        window.location.href = 'dashboard-manager.html';
      } else {
        window.location.href = 'dashboard-controller.html';
      }
    } catch (error) {
      console.error('Email login: error resolving role', error);
      window.location.href = 'dashboard-controller.html';
    }
  } else if (!user) {
    redirectInProgress = false;
  }
});

const emailSignInForm = document.getElementById('emailSignInForm');
if (emailSignInForm) {
  emailSignInForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    if (!email || !password) {
      showError('Please enter both your email and password.');
      return;
    }

    try {
      showLoading('Signing in with email...');

      const result = await userService.signIn(email, password);
      if (!result.success) {
        throw new Error(result.error || 'Unable to sign in with email. Please try again.');
      }

      hideLoading();
      showSuccess('Signed in successfully! Redirecting...');

    } catch (error) {
      console.error('Email sign-in error:', error);
      hideLoading();
      showError(error.message || 'Sign-in failed. Please check your credentials and try again.');
    }
  });
}

function showLoading(message) {
  const loadingEl = document.getElementById('loginMessage');
  if (loadingEl) {
    loadingEl.textContent = message;
    loadingEl.className = 'p-4 rounded-xl text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200';
    loadingEl.classList.remove('hidden');
  }

  const emailBtn = document.getElementById('emailSignIn');
  if (emailBtn) {
    emailBtn.disabled = true;
    emailBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

function hideLoading() {
  const loadingEl = document.getElementById('loginMessage');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }

  const emailBtn = document.getElementById('emailSignIn');
  if (emailBtn) {
    emailBtn.disabled = false;
    emailBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

function showSuccess(message) {
  showMessage(message, 'success');
}

function showError(message) {
  showMessage(message, 'error');
}

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

    setTimeout(() => {
      if (messageEl) {
        messageEl.classList.add('hidden');
      }
    }, 5000);
  }
}

