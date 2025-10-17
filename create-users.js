// Script to create all Thinkers Afrika users
// Run this in the browser console after Firebase is set up

// User data for all team members
const users = [
  {
    email: 'vincent@thinkersafrika.co.za',
    password: 'Vincent2024!', // Change this to a secure password
    displayName: 'Vincent Mogashoa',
    role: 'manager',
    permissions: {
      canApprove: true,
      canViewAll: true,
      canManageUsers: true,
    },
  },
  {
    email: 'keamogetswe@thinkersafrika.co.za',
    password: 'Kea2024!', // Change this to a secure password
    displayName: 'Kea Maripane',
    role: 'controller',
    permissions: {
      canApprove: true,
      canViewAll: false,
      canManageUsers: false,
    },
  },
  {
    email: 'control@thinkersafrika.co.za',
    password: 'Sipho2024!', // Change this to a secure password
    displayName: 'Sipho Mahlinza',
    role: 'controller',
    permissions: {
      canApprove: true,
      canViewAll: false,
      canManageUsers: false,
    },
  },
  {
    email: 'john@thinkersafrika.co.za',
    password: 'John2024!', // Change this to a secure password
    displayName: 'John Macharaga',
    role: 'controller',
    permissions: {
      canApprove: true,
      canViewAll: false,
      canManageUsers: false,
    },
  },
  {
    email: 'matshidiso@thinkersafrika.co.za',
    password: 'Matshidiso2024!', // Change this to a secure password
    displayName: 'Matshidiso Maake',
    role: 'controller',
    permissions: {
      canApprove: true,
      canViewAll: false,
      canManageUsers: false,
    },
  },
  {
    email: 'gontle@thinkersafrika.co.za',
    password: 'Gontle2024!', // Change this to a secure password
    displayName: 'Gontle Ditibane',
    role: 'controller',
    permissions: {
      canApprove: true,
      canViewAll: false,
      canManageUsers: false,
    },
  },
  {
    email: 'kabelo@thinkersafrika.co.za',
    password: 'Kabelo2024!', // Change this to a secure password
    displayName: 'Kabelo Tshabalala',
    role: 'controller',
    permissions: {
      canApprove: true,
      canViewAll: false,
      canManageUsers: false,
    },
  },
];

// Function to create all users
async function createAllUsers() {
  console.log('Starting user creation process...');

  for (const userData of users) {
    try {
      console.log(`Creating user: ${userData.displayName} (${userData.email})`);

      // Import the user service (make sure it's loaded)
      const { userService } = await import('./js/user-service.js');

      const result = await userService.createUser(userData.email, userData.password, {
        displayName: userData.displayName,
        role: userData.role,
        assignedSites: [],
        ...userData.permissions,
      });

      if (result.success) {
        console.log(`✅ Successfully created user: ${userData.displayName}`);
      } else {
        console.error(`❌ Failed to create user ${userData.displayName}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error creating user ${userData.displayName}:`, error);
    }
  }

  console.log('User creation process completed!');
}

// Instructions for running this script:
console.log(`
=== Thinkers Afrika User Creation Script ===

To create all users:

1. Open your browser and navigate to your application
2. Open the browser console (F12)
3. Make sure Firebase is loaded and working
4. Copy and paste this entire script into the console
5. Run: createAllUsers()

IMPORTANT: 
- Change the passwords in the users array above before running
- Make sure you're authenticated as an admin user
- This script will create all users in Firebase Authentication and Firestore

Users to be created:
${users.map((u) => `- ${u.displayName} (${u.email}) - ${u.role}`).join('\n')}
`);

// Export the function for use
window.createAllUsers = createAllUsers;
