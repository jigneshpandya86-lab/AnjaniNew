package com.anjani.water;

import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.provider.ContactsContract;
import java.util.ArrayList;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native Contacts plugin for Capacitor — saves a contact silently in background.
 * Called from firebase-api.js via window.Capacitor.Plugins.ContactsPlugin.save()
 *
 * Setup (one-time manual steps):
 *   1. Copy this file into android/app/src/main/java/com/anjani/water/
 *   2. In AndroidManifest.xml add:
 *        <uses-permission android:name="android.permission.WRITE_CONTACTS"/>
 *   3. In MainActivity.java, inside init() or the plugins list, add:
 *        add(ContactsPlugin.class);
 *   4. Run: npx cap sync android
 */
@CapacitorPlugin(name = "ContactsPlugin")
public class ContactsPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String name  = call.getString("name", "Facebook Lead");
        String phone = call.getString("phone", "");

        if (phone.isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();

            // Create a new raw contact
            ops.add(ContentProviderOperation
                .newInsert(ContactsContract.RawContacts.CONTENT_URI)
                .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null)
                .build());

            // Add display name
            ops.add(ContentProviderOperation
                .newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE,
                    ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name)
                .build());

            // Add mobile phone number
            ops.add(ContentProviderOperation
                .newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE,
                    ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, phone)
                .withValue(ContactsContract.CommonDataKinds.Phone.TYPE,
                    ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                .build());

            resolver.applyBatch(ContactsContract.AUTHORITY, ops);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Contact save failed: " + e.getMessage());
        }
    }
}
