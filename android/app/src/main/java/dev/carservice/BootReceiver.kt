package dev.carservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Автозапуск при включении магнитолы (питание подано)
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Запускаем фоновый сервис сразу при старте системы
            val serviceIntent = Intent(context, VoltageService::class.java)
            context.startForegroundService(serviceIntent)

            // Запускаем главную активность
            val mainIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(mainIntent)
        }
    }
}
