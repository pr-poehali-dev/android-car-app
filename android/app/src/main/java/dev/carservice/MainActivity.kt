package dev.carservice

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.IBinder
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var voltageService: VoltageService? = null
    private var serviceBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            val b = binder as VoltageService.LocalBinder
            voltageService = b.getService()
            serviceBound = true

            // Подписываемся на обновления напряжения и GPS
            voltageService?.onVoltageChanged = { voltage ->
                runOnUiThread {
                    webView.evaluateJavascript(
                        "if(window.onVoltageUpdate) window.onVoltageUpdate($voltage);", null
                    )
                }
            }
            voltageService?.onGpsKmChanged = { km ->
                runOnUiThread {
                    webView.evaluateJavascript(
                        "if(window.onGpsKmUpdate) window.onGpsKmUpdate($km);", null
                    )
                }
            }
        }

        override fun onServiceDisconnected(name: ComponentName) {
            serviceBound = false
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
        }
        webView.webViewClient = WebViewClient()

        // Регистрируем JS-мост
        webView.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")

        // Загружаем сайт (замените URL на ваш домен или assets)
        webView.loadUrl("https://ВАШ_ДОМЕН.poehali.dev")

        // Запускаем фоновый сервис
        val intent = Intent(this, VoltageService::class.java)
        startService(intent)
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (serviceBound) unbindService(serviceConnection)
    }
}

// JS-мост: вызывается из JavaScript через window.AndroidBridge
class AndroidBridge(private val context: Context) {

    private val prefs = context.getSharedPreferences("car_service", Context.MODE_PRIVATE)

    @JavascriptInterface
    fun saveData(json: String) {
        prefs.edit().putString("data", json).apply()
    }

    @JavascriptInterface
    fun loadData(): String {
        return prefs.getString("data", "") ?: ""
    }
}
