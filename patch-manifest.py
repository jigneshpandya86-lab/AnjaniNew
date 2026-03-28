#!/usr/bin/env python3
"""
Patches the Android project after `cap add android`:
  1. Adds permissions to AndroidManifest.xml
  2. Copies SmsPlugin.java into the app package
  3. Registers SmsPlugin in MainActivity.java
"""
import sys
import os
import shutil

MANIFEST    = 'android/app/src/main/AndroidManifest.xml'
JAVA_DIR    = 'android/app/src/main/java/com/anjani/water'
MAIN_ACT    = f'{JAVA_DIR}/MainActivity.java'
SMS_SRC     = 'SmsPlugin.java'
SMS_DST     = f'{JAVA_DIR}/SmsPlugin.java'

# ── 1. Manifest permissions ────────────────────────────────────────────────────
PERMISSIONS = """
    <!-- ── SMS ── -->
    <uses-permission android:name="android.permission.SEND_SMS"/>
    <uses-permission android:name="android.permission.RECEIVE_SMS"/>
    <uses-permission android:name="android.permission.READ_SMS"/>

    <!-- ── Camera ── -->
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-feature android:name="android.hardware.camera" android:required="false"/>
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false"/>

    <!-- ── Location ── -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>

    <!-- ── Storage / Files ── -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29"/>
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>

    <!-- ── Network ── -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE"/>

    <!-- ── WhatsApp deep-link (Android 11+) ── -->
    <queries>
        <package android:name="com.whatsapp"/>
        <package android:name="com.whatsapp.w4b"/>
        <intent>
            <action android:name="android.intent.action.SEND"/>
            <data android:mimeType="text/plain"/>
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="whatsapp"/>
        </intent>
    </queries>

"""

try:
    with open(MANIFEST, 'r') as f:
        content = f.read()

    if 'SEND_SMS' not in content:
        content = content.replace('</manifest>', PERMISSIONS + '</manifest>')
        with open(MANIFEST, 'w') as f:
            f.write(content)
        print('✅ AndroidManifest.xml patched with permissions.')
    else:
        print('Permissions already patched, skipping manifest.')

except FileNotFoundError:
    print(f'❌ Manifest not found: {MANIFEST}')
    sys.exit(1)

# ── 2. Copy SmsPlugin.java ─────────────────────────────────────────────────────
if not os.path.exists(SMS_SRC):
    print(f'❌ SmsPlugin.java not found at repo root.')
    sys.exit(1)

os.makedirs(JAVA_DIR, exist_ok=True)
shutil.copy(SMS_SRC, SMS_DST)
print(f'✅ SmsPlugin.java copied to {SMS_DST}')

# ── 3. Patch MainActivity.java to register SmsPlugin ──────────────────────────
PATCHED_MAIN = """\
package com.anjani.water;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
"""

try:
    with open(MAIN_ACT, 'r') as f:
        existing = f.read()

    if 'registerPlugin' in existing:
        print('SmsPlugin already registered in MainActivity, skipping.')
    else:
        with open(MAIN_ACT, 'w') as f:
            f.write(PATCHED_MAIN)
        print('✅ MainActivity.java patched to register SmsPlugin.')

except FileNotFoundError:
    print(f'❌ MainActivity.java not found: {MAIN_ACT}')
    sys.exit(1)

print('🎉 All Android patches applied successfully.')
