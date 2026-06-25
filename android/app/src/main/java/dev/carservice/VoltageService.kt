package dev.carservice

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import androidx.core.app.NotificationCompat
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import kotlin.math.roundToInt

/**
 * Фоновый сервис, который:
 * 1. Читает напряжение бортовой сети с ACC/BAT (через sys/class/power_supply)
 * 2. Считает GPS-пробег
 * 3. Уведомляет MainActivity через колбэки
 * Работает постоянно как Foreground Service
 */
class VoltageService : Service() {

    inner class LocalBinder : Binder() {
        fun getService(): VoltageService = this@VoltageService
    }

    private val binder = LocalBinder()

    var onVoltageChanged: ((Double) -> Unit)? = null
    var onGpsKmChanged: ((Int) -> Unit)? = null

    private val handler = Handler(Looper.getMainLooper())
    private var totalKm = 0
    private var lastLocation: Location? = null
    private lateinit var locationManager: LocationManager

    private val voltageRunnable = object : Runnable {
        override fun run() {
            val voltage = readVoltage()
            onVoltageChanged?.invoke(voltage)
            handler.postDelayed(this, 2000) // опрос каждые 2 секунды
        }
    }

    private val locationListener = LocationListener { location ->
        lastLocation?.let { prev ->
            val distanceM = prev.distanceTo(location)
            if (distanceM > 5) { // фильтр дрейфа GPS < 5 м
                totalKm += (distanceM / 1000.0).roundToInt()
                onGpsKmChanged?.invoke(totalKm)
            }
        }
        lastLocation = location
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(1, buildNotification())
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        handler.post(voltageRunnable)
        startGps()
        return START_STICKY // перезапускаться автоматически если убили
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(voltageRunnable)
        try { locationManager.removeUpdates(locationListener) } catch (e: Exception) { }
    }

    /**
     * Читает напряжение бортовой сети.
     * На большинстве Android-магнитол напряжение доступно через:
     * /sys/class/power_supply/battery/voltage_now (в микровольтах)
     * или /sys/class/power_supply/ac/voltage_now
     * Если файл недоступен — возвращает заглушку 12.4 В
     */
    private fun readVoltage(): Double {
        val paths = listOf(
            "/sys/class/power_supply/battery/voltage_now",
            "/sys/class/power_supply/ac/voltage_now",
            "/sys/class/power_supply/BAT/voltage_now",
            "/sys/class/power_supply/main_battery/voltage_now",
        )
        for (path in paths) {
            try {
                val file = File(path)
                if (file.exists()) {
                    val raw = BufferedReader(FileReader(file)).readLine()?.trim()?.toLongOrNull()
                    if (raw != null) {
                        // Значение в микровольтах → вольты
                        return raw / 1_000_000.0
                    }
                }
            } catch (e: Exception) { /* пробуем следующий путь */ }
        }
        // Fallback: если ни один путь не доступен
        return 12.4
    }

    private fun startGps() {
        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                3000L,  // не чаще раз в 3 сек
                5f,     // не менее 5 м смещения
                locationListener
            )
        } catch (e: SecurityException) {
            // Нет разрешения — GPS не будет работать
        }
    }

    private fun buildNotification(): Notification {
        val channelId = "car_service_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Мониторинг автомобиля",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Сервис·Авто")
            .setContentText("Мониторинг напряжения и пробега активен")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
