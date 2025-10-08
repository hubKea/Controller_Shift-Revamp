#!/bin/bash

# Firebase Firestore Rules Deployment Script
# This script deploys the Firestore security rules to your Firebase project

echo "🚀 Deploying Firestore Security Rules..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ You are not logged in to Firebase. Please login first:"
    echo "   firebase login"
    exit 1
fi

# Check if firebase.json exists
if [ ! -f "firebase.json" ]; then
    echo "❌ firebase.json not found. Creating one..."
    cat > firebase.json << EOF
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
EOF
fi

# Deploy the rules
echo "📝 Deploying Firestore rules..."
firebase deploy --only firestore:rules

if [ $? -eq 0 ]; then
    echo "✅ Firestore rules deployed successfully!"
    echo ""
    echo "🔒 Security Rules Summary:"
    echo "   • Users can only read their own reports"
    echo "   • Managers can read all reports"
    echo "   • Controllers can read submitted reports for review"
    echo "   • Only draft reports can be edited/deleted"
    echo "   • Critical fields (status, createdBy, etc.) are protected"
    echo "   • Approvals cannot be modified once created"
    echo ""
    echo "🎉 Your Firestore database is now secure!"
else
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi
