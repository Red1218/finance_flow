package com.anonymous.finance_flow

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isNullOrEmpty()) return

    val sender = messages[0].originatingAddress ?: return
    // Only messages from a known bank sender go any further — everything else
    // (OTPs, personal messages) is dropped here rather than stored at rest.
    if (KNOWN_BANK_CODES.none { sender.contains(it) }) return

    // Multi-part SMS arrive as multiple PDUs in one intent — a message that
    // reads only messages[0] silently truncates long SMS. See the spec's
    // "Multi-part SMS gotcha" for a real example this caught.
    val body = messages.joinToString("") { it.messageBody ?: "" }
    val timestamp = messages[0].timestampMillis

    persistToQueue(context, sender, body, timestamp)
    tryEmitLive(context, sender, body, timestamp)
  }

  private fun persistToQueue(context: Context, sender: String, body: String, timestamp: Long) {
    val prefs = context.getSharedPreferences(QUEUE_PREFS, Context.MODE_PRIVATE)
    val arr = try {
      JSONArray(prefs.getString(QUEUE_KEY, "[]"))
    } catch (e: org.json.JSONException) {
      JSONArray() // corrupted queue -- start fresh rather than crash the receiver
    }
    val entry = JSONObject()
    entry.put("sender", sender)
    entry.put("body", body)
    entry.put("timestamp", timestamp)
    arr.put(entry)
    prefs.edit().putString(QUEUE_KEY, arr.toString()).apply()
  }

  private fun tryEmitLive(context: Context, sender: String, body: String, timestamp: Long) {
    // reactHost (not the legacy reactNativeHost.reactInstanceManager) is the
    // correct accessor under this project's confirmed New Architecture /
    // Bridgeless config (newArchEnabled: true in app.json and
    // android/gradle.properties) -- the legacy path resolves a separate,
    // never-started ReactInstanceManager and its currentReactContext is
    // always null here.
    val reactContext = (context.applicationContext as? ReactApplication)
      ?.reactHost?.currentReactContext ?: return
    val map = Arguments.createMap()
    map.putString("sender", sender)
    map.putString("body", body)
    map.putDouble("timestamp", timestamp.toDouble())
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_NAME, map)
  }

  companion object {
    // Duplicated from the JS parsers' `bankCode` values
    // (src/domain/smsParsers/*.ts), which are the source of truth — there is no
    // shared-code mechanism between Kotlin and TypeScript here, so adding a bank
    // there means adding it here too.
    private val KNOWN_BANK_CODES = listOf("KOTAKB", "AXISBK")
    const val QUEUE_PREFS = "sms_listener_queue"
    const val QUEUE_KEY = "pending"
    const val EVENT_NAME = "SmsListener:onSms"
  }
}
