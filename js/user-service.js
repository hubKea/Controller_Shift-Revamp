// Centralized User Management Service
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { auth, db } from '../firebase-config.js';
import { ROLE_CONTROLLER, ROLE_MANAGER, ROLE_REVIEWER } from './constants.js';

class UserService {
  constructor() {
    this.currentUser = null;
    this.userRole = null;
    this.userPermissions = null;
    this.setupAuthListener();
  }

  // Set up authentication state listener
  setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser = user;
        // Load user profile but don't create if it doesn't exist
        const userProfile = await this.getUserProfile(user.uid);
        this.userRole = userProfile.role;
        this.userPermissions = userProfile.permissions;

        // Persist role in sessionStorage for role-aware navigation
        sessionStorage.setItem('userRole', this.userRole);
        sessionStorage.setItem('userUid', user.uid);
        sessionStorage.setItem('userEmail', user.email);

        this.onAuthStateChange(user, this.userRole, this.userPermissions);
      } else {
        this.currentUser = null;
        this.userRole = null;
        this.userPermissions = null;

        // Clear sessionStorage on logout
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('userUid');
        sessionStorage.removeItem('userEmail');

        this.onAuthStateChange(null, null, null);
      }
    });
  }

  // Get user profile from Firestore - returns default if not found
  async getUserProfile(uid) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return userData;
      } else {
        console.error(
          '[UserService] User profile not found in Firestore, returning default profile'
        );
        // Return default profile without creating in database
        return this.getDefaultUserProfile(uid);
      }
    } catch (error) {
      console.error('[UserService] Error loading user profile:', error);
      // Return default profile on error
      return this.getDefaultUserProfile(uid);
    }
  }

  // Get user role - uses getUserProfile internally
  async getUserRole(uid) {
    try {
      const userProfile = await this.getUserProfile(uid);
      return userProfile.role;
    } catch (error) {
      console.error('[UserService] Error getting user role:', error);
      return ROLE_CONTROLLER; // Default fallback
    }
  }

  // Get user permissions - uses getUserProfile internally
  async getUserPermissions(uid) {
    try {
      const userProfile = await this.getUserProfile(uid);
      return userProfile.permissions;
    } catch (error) {
      console.error('[UserService] Error getting user permissions:', error);
      return this.getDefaultPermissions(ROLE_CONTROLLER);
    }
  }

  // Get role from sessionStorage (for immediate access)
  getStoredRole() {
    return sessionStorage.getItem('userRole');
  }

  // Get stored user info
  getStoredUserInfo() {
    return {
      uid: sessionStorage.getItem('userUid'),
      email: sessionStorage.getItem('userEmail'),
      role: sessionStorage.getItem('userRole'),
    };
  }

  // Central Authentication Guard - Blocking role check with conditional redirection
  async initializeAuthGuard() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        try {
          if (!user) {
            // User not authenticated - redirect to login if not already there
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            if (currentPage !== 'index.html') {
              window.location.href = 'index.html';
              return;
            }
            resolve({ authenticated: false, user: null, role: null });
            return;
          }

          // Fetch user role from Firestore (blocking)
          const userProfile = await this.getUserProfile(user.uid);
          const userRole = userProfile.role;

          // Store in sessionStorage for quick access
          sessionStorage.setItem('userRole', userRole);
          sessionStorage.setItem('userUid', user.uid);
          sessionStorage.setItem('userEmail', user.email);

          // Conditional redirection based on role and current page
          const currentPage = window.location.pathname.split('/').pop() || 'index.html';

          let shouldRedirect = false;
          let redirectUrl = '';

          if (userRole === ROLE_MANAGER) {
            // Manager should be on manager dashboard or report-form
            if (
              currentPage !== 'dashboard-manager.html' &&
              currentPage !== 'report-form.html' &&
              currentPage !== 'approve.html'
            ) {
              shouldRedirect = true;
              redirectUrl = 'dashboard-manager.html';
            }
          } else if (userRole === ROLE_CONTROLLER) {
            // Controller should be on controller dashboard or report-form
            if (currentPage !== 'dashboard-controller.html' && currentPage !== 'report-form.html') {
              shouldRedirect = true;
              redirectUrl = 'dashboard-controller.html';
            }
          }

          if (shouldRedirect) {
            window.location.href = redirectUrl;
            return;
          }

          // Update current instance properties
          this.currentUser = user;
          this.userRole = userRole;
          this.userPermissions = userProfile.permissions;

          resolve({
            authenticated: true,
            user: user,
            role: userRole,
            permissions: userProfile.permissions,
          });
        } catch (error) {
          console.error('[AuthGuard] Error during role check:', error);
          // Fallback to controller role if error occurs
          const fallbackRole = ROLE_CONTROLLER;
          sessionStorage.setItem('userRole', fallbackRole);
          sessionStorage.setItem('userUid', user.uid);
          sessionStorage.setItem('userEmail', user.email);

          resolve({
            authenticated: true,
            user: user,
            role: fallbackRole,
            permissions: this.getDefaultPermissions(fallbackRole),
            error: error.message,
          });
        }
      });
    });
  }

  // Get default user profile (no database write)
  getDefaultUserProfile(uid) {
    const user = this.currentUser;
    if (!user) {
      return {
        uid: uid,
        email: 'unknown@example.com',
        displayName: 'Unknown User',
        role: ROLE_CONTROLLER,
        isActive: true,
        assignedSites: [],
        permissions: this.getDefaultPermissions(ROLE_CONTROLLER),
      };
    }

    const email = user.email;
    let role = ROLE_CONTROLLER; // Default role

    // Check if user is manager based on email
    if (email === 'vincent@thinkersafrika.co.za') {
      role = ROLE_MANAGER;
    }

    return {
      uid: uid,
      email: email,
      displayName: user.displayName || email.split('@')[0],
      role: role,
      isActive: true,
      assignedSites: [],
      permissions: this.getDefaultPermissions(role),
    };
  }

  // Get default permissions based on role
  getDefaultPermissions(role) {
    const permissionsByRole = {
      [ROLE_CONTROLLER]: {
        canApprove: true, // Controllers can approve in this system
        canViewAll: false,
        canManageUsers: false,
        canCreateReports: true,
      },
      [ROLE_MANAGER]: {
        canApprove: true,
        canViewAll: true,
        canManageUsers: true,
        canCreateReports: true,
      },
      [ROLE_REVIEWER]: {
        canApprove: true,
        canViewAssignedReports: true,
        canViewOwnReports: true,
      },
    };

    return permissionsByRole[role] || permissionsByRole[ROLE_CONTROLLER];
  }

  // Sign in with email and password
  async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message };
    }
  }

  // Sign out
  async signOut() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Alias for signOut() to support existing code that still calls logout().
   */
  async logout() {
    return this.signOut();
  }

  // Create new user (admin function) - REMOVED CLIENT-SIDE WRITES
  async createUser(email, password, userData) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update display name
      await updateProfile(user, {
        displayName: userData.displayName,
      });

      // NOTE: User document creation should be done server-side or by admin
      // Client-side writes are disabled for security
      console.error(
        'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â User created in Auth but profile must be created by admin in Firestore console'
      );

      return { success: true, user: user };
    } catch (error) {
      console.error('Create user error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get all users (manager function) - READ ONLY
  async getAllUsers() {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const users = [];
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return { success: true, users: users };
    } catch (error) {
      console.error('Get users error:', error);
      return { success: false, error: error.message };
    }
  }

  // Update user role (manager function) - DISABLED CLIENT-SIDE WRITES
  async updateUserRole() {
    console.error('[UserService] User role updates must be done by admin in Firestore console');
    return { success: false, error: 'Client-side user updates are disabled for security' };
  }

  // Check if user has permission
  hasPermission(permission) {
    if (!this.currentUser || !this.userRole) return false;

    const permissionsByRole = {
      [ROLE_CONTROLLER]: {
        canCreateReports: true,
        canViewOwnReports: true,
        canEditOwnReports: true,
      },
      [ROLE_REVIEWER]: {
        canApprove: true,
        canViewAssignedReports: true,
        canViewOwnReports: true,
      },
      [ROLE_MANAGER]: {
        canViewAll: true,
        canApprove: true,
        canManageUsers: true,
        canViewAllReports: true,
      },
    };

    return permissionsByRole[this.userRole]?.[permission] || false;
  }

  // Get current user info
  getCurrentUser() {
    return {
      user: this.currentUser,
      role: this.userRole,
      isAuthenticated: !!this.currentUser,
    };
  }

  // Override this method in your app to handle auth state changes
  onAuthStateChange(/* user, role */) {
    // This will be called whenever authentication state changes
    // Override this method in your main application
  }
}

// Create and export singleton instance
export const userService = new UserService();
export default userService;
