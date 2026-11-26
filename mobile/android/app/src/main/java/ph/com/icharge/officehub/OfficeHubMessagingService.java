package ph.com.icharge.officehub;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Phone alerts from Office Hub (Firebase Cloud Messaging).
 * While the app is closed, Android shows them itself; while it is open, they arrive here and are shown the same way.
 * Tapping one opens the page it links to.
 */
public class OfficeHubMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(RemoteMessage message) {
        RemoteMessage.Notification n = message.getNotification();
        String title = n != null && n.getTitle() != null ? n.getTitle() : message.getData().get("title");
        String body = n != null && n.getBody() != null ? n.getBody() : message.getData().get("body");
        if (title == null) return;
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        String url = message.getData().get("url");
        if (url != null) open.putExtra("url", url);
        PendingIntent tap = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, MainActivity.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification_icon)
            .setColor(Color.parseColor("#8FD220"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap);
        NotificationManagerCompat.from(this).notify((int) System.currentTimeMillis(), b.build());
    }

    @Override
    public void onNewToken(String token) {
        // The website asks for the current token every time the app opens and saves it then.
    }
}
