package br.com.interfone.morador;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IntercomNative")
public class IntercomNativePlugin extends Plugin {
    private Ringtone ringtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock callWakeLock;

    @PluginMethod
    public void isFirebaseConfigured(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available = false;
        try {
            Class<?> clazz = Class.forName("com.google.firebase.FirebaseApp");
            java.lang.reflect.Method getApps = clazz.getMethod("getApps", Context.class);
            java.util.List<?> apps = (java.util.List<?>) getApps.invoke(null, getContext());
            available = (apps != null && !apps.isEmpty());
        } catch (Throwable t) {
            available = false;
        }
        ret.put("available", available);
        call.resolve(ret);
    }

    @PluginMethod
    public void startService(PluginCall call) {
        try {
            String userId = call.getString("userId", null);
            String apiBase = call.getString("apiBase", null);
            Context context = getContext();
            Intent serviceIntent = new Intent(context, IntercomForegroundService.class);
            if (userId != null) serviceIntent.putExtra("userId", userId);
            if (apiBase != null) serviceIntent.putExtra("apiBase", apiBase);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
        call.resolve();
    }

    @PluginMethod
    public void enableSpeakerphone(PluginCall call) {
        try {
            Context context = getContext();
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                am.setSpeakerphoneOn(true);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
        call.resolve();
    }

    @PluginMethod
    public void disableSpeakerphone(PluginCall call) {
        try {
            Context context = getContext();
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
        call.resolve();
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, IntercomForegroundService.class);
            context.stopService(serviceIntent);
        } catch (Throwable t) {
            t.printStackTrace();
        }
        call.resolve();
    }

    @PluginMethod
    public void playRingtone(PluginCall call) {
        try {
            String visitorName = call.getString("visitorName", "Visitante");
            String propertyName = call.getString("propertyName", "sua residência");
            Context context = getContext();

            // 1. Wake screen up
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (callWakeLock == null || !callWakeLock.isHeld()) {
                    callWakeLock = pm.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "InterfoneMorador::CallWakeLock"
                    );
                    callWakeLock.acquire(60 * 1000L);
                }
            }

            // 2. Play native ringtone
            try {
                stopRingtoneInternal();
                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                ringtone = RingtoneManager.getRingtone(context, ringtoneUri);
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
            } catch (Throwable e) {
                e.printStackTrace();
            }

            // 3. Start Vibration pattern
            try {
                vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    long[] pattern = { 0, 1000, 1000, 1000, 1000 };
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                    } else {
                        vibrator.vibrate(pattern, 0);
                    }
                }
            } catch (Throwable e) {
                e.printStackTrace();
            }

            // 4. Show Fullscreen Heads-up Call Notification
            showCallNotification(visitorName, propertyName);
        } catch (Throwable t) {
            t.printStackTrace();
        }
        call.resolve();
    }

    @PluginMethod
    public void stopRingtone(PluginCall call) {
        stopRingtoneInternal();
        call.resolve();
    }

    private void stopRingtoneInternal() {
        try {
            if (ringtone != null && ringtone.isPlaying()) {
                ringtone.stop();
            }
            ringtone = null;
        } catch (Throwable e) {}

        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
            vibrator = null;
        } catch (Throwable e) {}

        try {
            if (callWakeLock != null && callWakeLock.isHeld()) {
                callWakeLock.release();
            }
            callWakeLock = null;
        } catch (Throwable e) {}

        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(2002);
            }
        } catch (Throwable e) {}
    }

    private void showCallNotification(String visitorName, String propertyName) {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
            );

            Notification notification = new NotificationCompat.Builder(context, "intercom_calls")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("🔔 INTERFONE: " + visitorName)
                .setContentText("Chamando a " + propertyName)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .setAutoCancel(true)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(2002, notification);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }
}
