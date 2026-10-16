package br.com.interfone.morador;

import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Throwable current = throwable;
            boolean isFirebaseError = false;
            while (current != null) {
                if (current instanceof IllegalStateException && current.getMessage() != null && current.getMessage().contains("Default FirebaseApp is not initialized")) {
                    isFirebaseError = true;
                    break;
                }
                current = current.getCause();
            }
            if (isFirebaseError) {
                android.util.Log.w("InterfoneMorador", "Firebase não inicializado (google-services.json pendente). Continuando com conexão WebSocket em tempo real.");
                return;
            }
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });

        registerPlugin(IntercomNativePlugin.class);
        super.onCreate(savedInstanceState);
        createCallNotificationChannel();
        configureLockScreenFlags();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            java.util.List<String> perms = new java.util.ArrayList<>();
            perms.add(android.Manifest.permission.RECORD_AUDIO);
            perms.add(android.Manifest.permission.CAMERA);
            if (Build.VERSION.SDK_INT >= 33) {
                perms.add(android.Manifest.permission.POST_NOTIFICATIONS);
            }
            java.util.List<String> needed = new java.util.ArrayList<>();
            for (String p : perms) {
                if (checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    needed.add(p);
                }
            }
            if (!needed.isEmpty()) {
                requestPermissions(needed.toArray(new String[0]), 101);
            }

            checkAndRequestOverlayPermission();
        }
    }

    private void checkAndRequestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(this)) {
                android.util.Log.i("InterfoneMorador", "Solicitando permissão de sobreposição de tela (SYSTEM_ALERT_WINDOW)");
                try {
                    android.content.Intent intent = new android.content.Intent(
                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        android.net.Uri.parse("package:" + getPackageName())
                    );
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        android.content.Intent intent = new android.content.Intent(
                            android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION
                        );
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }
        }
    }

    private void configureLockScreenFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
    }

    private void createCallNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            "intercom_calls",
            "Chamadas do Interfone",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Alertas de chamadas recebidas pelo interfone");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{ 0, 1000, 1000, 1000, 1000 });
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            webView.setWebChromeClient(new android.webkit.WebChromeClient() {
                @Override
                public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                    request.grant(request.getResources());
                }
            });
        }
    }
}
