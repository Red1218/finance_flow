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
    val arr = JSONArray(prefs.getString(SmsReceiver.QUEUE_KEY, "[]"))
    val result = Arguments.createArray()
    for (i in 0 until arr.length()) {
      val obj = arr.getJSONObject(i)
      val map = Arguments.createMap()
      map.putString("sender", obj.getString("sender"))
      map.putString("body", obj.getString("body"))
      map.putDouble("timestamp", obj.getDouble("timestamp"))
      result.pushMap(map)
    }
    prefs.edit().putString(SmsReceiver.QUEUE_KEY, "[]").apply()
    promise.resolve(result)
  }
}
