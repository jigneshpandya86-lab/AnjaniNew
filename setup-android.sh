#!/usr/bin/env bash
# setup-android.sh — Run this once on your local machine after git pull
# Sets up the Android project with SmsPlugin + ContactsPlugin
set -e

echo "=== Anjani Water — Android Setup ==="

# 1. Install Node deps if needed
echo "[1/5] Installing npm dependencies..."
npm install

# 2. Build www (copy web files)
echo "[2/5] Preparing web assets..."
mkdir -p www
cp index.html www/
cp firebase-api.js www/ 2>/dev/null || true
cp firebase-config.js www/ 2>/dev/null || true
cp manifest.json www/ 2>/dev/null || true
cp sw.js www/ 2>/dev/null || true
cp app.js www/ 2>/dev/null || true

# 3. Add Android platform if not already present
if [ ! -d "android" ]; then
  echo "[3/5] Adding Android platform..."
  npx cap add android
else
  echo "[3/5] Android platform already exists, skipping."
fi

# 4. Copy plugin Java files into Android project
echo "[4/5] Copying plugins to Android project..."
JAVA_DIR="android/app/src/main/java/com/anjani/water"
mkdir -p "$JAVA_DIR"
cp SmsPlugin.java "$JAVA_DIR/SmsPlugin.java"
cp ContactsPlugin.java "$JAVA_DIR/ContactsPlugin.java"

# 5. Patch MainActivity.java to register both plugins
echo "[5/5] Patching MainActivity.java..."
cat > "$JAVA_DIR/MainActivity.java" << 'JAVA'
package com.anjani.water;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsPlugin.class);
        registerPlugin(ContactsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
JAVA

# 6. Patch AndroidManifest.xml to add permissions
MANIFEST="android/app/src/main/AndroidManifest.xml"
if ! grep -q "SEND_SMS" "$MANIFEST"; then
  sed -i 's|<uses-permission android:name="android.permission.INTERNET" />|<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.SEND_SMS" />\n    <uses-permission android:name="android.permission.WRITE_CONTACTS" />\n    <uses-permission android:name="android.permission.READ_CONTACTS" />|' "$MANIFEST"
  echo "    Permissions added to AndroidManifest.xml"
else
  echo "    Permissions already present."
fi

# 7. Sync Capacitor
echo "[6/6] Syncing Capacitor..."
npx cap sync android

echo ""
echo "=== Setup complete! ==="
echo "Next: Open 'android/' folder in Android Studio → Build → Generate Signed APK"
echo "   OR run: cd android && ./gradlew assembleDebug"
echo "   APK will be at: android/app/build/outputs/apk/debug/app-debug.apk"
