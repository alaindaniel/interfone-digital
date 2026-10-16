package br.com.interfone.morador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class IntercomForegroundService extends Service {
    public static final String CHANNEL_ID = "intercom_service_channel";
    public static final int NOTIFICATION_ID = 1001;
    public static final int CALL_NOTIFICATION_ID = 2002;

    private PowerManager.WakeLock wakeLock;
    private Thread pollingThread;
    private volatile boolean isRunning = false;
    private volatile boolean isRinging = false;
    private Ringtone ringtone;
    private Vibrator vibrator;

    private String userId;
    private String apiBase;

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            createNotificationChannel();
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "InterfoneMorador::ServiceWakeLock");
                wakeLock.acquire(24 * 60 * 60 * 1000L);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            SharedPreferences prefs = getSharedPreferences("interfone_prefs", MODE_PRIVATE);
            if (intent != null) {
                String u = intent.getStringExtra("userId");
                String a = intent.getStringExtra("apiBase");
                if (u != null && !u.isEmpty()) {
                    userId = u;
                    prefs.edit().putString("userId", u).apply();
                }
                if (a != null && !a.isEmpty()) {
                    apiBase = a;
                    prefs.edit().putString("apiBase", a).apply();
                }
            }
            if (userId == null) userId = prefs.getString("userId", null);
            if (apiBase == null) apiBase = prefs.getString("apiBase", "https://interfone-api.onrender.com");
            if (apiBase != null && apiBase.contains("192.168.")) apiBase = "https://interfone-api.onrender.com";

            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
            );

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Interfone Morador Conectado")
                .setContentText("Monitorando chamadas em segundo plano")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }

            startPolling();
        } catch (Throwable t) {
            t.printStackTrace();
        }
        return START_STICKY;
    }

    private void startPolling() {
        if (pollingThread != null && pollingThread.isAlive()) return;
        isRunning = true;
        pollingThread = new Thread(() -> {
            while (isRunning) {
                try {
                    if (userId != null && apiBase != null) {
                        checkIncomingCall();
                    }
                    Thread.sleep(1500);
                } catch (InterruptedException e) {
                    break;
                } catch (Throwable t) {
                    try { Thread.sleep(3000); } catch (Exception ignored) {}
                }
            }
        });
        pollingThread.start();
    }

    private void checkIncomingCall() {
        HttpURLConnection conn = null;
        try {
            String urlStr = apiBase.replaceAll("/+$", "") + "/api/resident/active-incoming-call/" + userId;
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                JSONObject json = new JSONObject(sb.toString());
                boolean hasCall = json.optBoolean("hasCall", false);

                if (hasCall) {
                    JSONObject call = json.optJSONObject("call");
                    JSONObject prop = json.optJSONObject("property");
                    String visitorName = call != null ? call.optString("visitorName", "Visitante") : "Visitante";
                    String propName = prop != null ? prop.optString("name", "Sua Residência") : "Sua Residência";

                    if (!isRinging) {
                        isRinging = true;
                        triggerBackgroundAlert(visitorName, propName);
                    }
                } else {
                    if (isRinging) {
                        isRinging = false;
                        stopBackgroundAlert();
                    }
                }
            }
        } catch (Throwable ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void triggerBackgroundAlert(String visitorName, String propName) {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "InterfoneMorador::IncomingCallWakeLock"
                );
                wl.acquire(60 * 1000L);
            }

            try {
                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                ringtone = RingtoneManager.getRingtone(this, ringtoneUri);
                if (ringtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        ringtone.setAudioAttributes(
                            new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build()
                        );
                    }
                    ringtone.play();
                }
            } catch (Throwable ignored) {}

            try {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    long[] pattern = { 0, 1000, 1000, 1000, 1000 };
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                    } else {
                        vibrator.vibrate(pattern, 0);
                    }
                }
            } catch (Throwable ignored) {}

            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(launchIntent);

            PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
            );

            Notification callNotif = new NotificationCompat.Builder(this, "intercom_calls")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("🔔 INTERFONE: " + visitorName)
                .setContentText("Chamando " + propName)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .setAutoCancel(true)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(CALL_NOTIFICATION_ID, callNotif);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    public void stopBackgroundAlert() {
        try {
            if (ringtone != null && ringtone.isPlaying()) {
                ringtone.stop();
            }
            ringtone = null;
        } catch (Throwable ignored) {}

        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
            vibrator = null;
        } catch (Throwable ignored) {}

        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(CALL_NOTIFICATION_ID);
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (pollingThread != null) {
            pollingThread.interrupt();
        }
        stopBackgroundAlert();
        super.onDestroy();
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID,
                "Serviço de Interfone em Segundo Plano",
                NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Mantém o interfone ativo em segundo plano");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
