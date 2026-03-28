package com.anjani.water;

import android.telephony.SmsManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native SMS plugin for Capacitor — sends SMS silently in background.
 * Called from firebase-api.js via window.Capacitor.Plugins.SmsPlugin.send()
 */
@CapacitorPlugin(name = "SmsPlugin")
public class SmsPlugin extends Plugin {

    @PluginMethod
    public void send(PluginCall call) {
        String phone   = call.getString("phone", "");
        String message = call.getString("message", "");

        if (phone.isEmpty() || message.isEmpty()) {
            call.reject("Phone and message are required");
            return;
        }

        try {
            SmsManager sms = SmsManager.getDefault();
            if (message.length() > 160) {
                java.util.ArrayList<String> parts = sms.divideMessage(message);
                sms.sendMultipartTextMessage(phone, null, parts, null, null);
            } else {
                sms.sendTextMessage(phone, null, message, null, null);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("SMS send failed: " + e.getMessage());
        }
    }
}
