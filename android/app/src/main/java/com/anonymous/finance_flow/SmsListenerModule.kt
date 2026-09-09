package com.anonymous.finance_flow

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray

class SmsListenerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SmsListenerModule"

  @ReactMethod
  fun drainQueue(promise: Promise) {
    val prefs = reactApplicationContext.getSharedPreferences(SmsReceiver.QUEUE_PREFS, Context.MODE_PRIVATE)
    // Same defensive read as SmsReceiver.persistToQueue: a corrupted queue must
    // drain as empty (and reset itself) rather than reject forever and kill
    // SMS detection for the rest of the app session.
    val arr = try {
      JSONArray(prefs.getString(SmsReceiver.QUEUE_KEY, "[]"))
    } catch (e: org.json.JSONException) {
      JSONArray()
    }
    val result = Arguments.createArray()
    for (i in 0 until arr.length()) {
      val obj = arr.optJSONObject(i) ?: continue
      val map = Arguments.createMap()
      map.putString("sender", obj.optString("sender"))
      map.putString("body", obj.optString("body"))
      map.putDouble("timestamp", obj.optDouble("timestamp", 0.0))
      result.pushMap(map)
    }
    prefs.edit().putString(SmsReceiver.QUEUE_KEY, "[]").apply()
    promise.resolve(result)
  }
}
