#!/usr/bin/env python3
"""Patches AndroidManifest.xml after `cap add android` to add required permissions."""
import sys

MANIFEST = 'android/app/src/main/AndroidManifest.xml'

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

    if 'SEND_SMS' in content:
        print('Permissions already patched, skipping.')
        sys.exit(0)

    content = content.replace('</manifest>', PERMISSIONS + '</manifest>')

    with open(MANIFEST, 'w') as f:
        f.write(content)

    print('✅ AndroidManifest.xml patched with all permissions.')

except FileNotFoundError:
    print(f'❌ File not found: {MANIFEST}')
    sys.exit(1)
