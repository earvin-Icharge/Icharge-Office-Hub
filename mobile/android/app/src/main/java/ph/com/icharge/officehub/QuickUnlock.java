package ph.com.icharge.officehub;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

/**
 * Quick sign-in with the phone's own fingerprint (or screen lock).
 * A private key is created in the phone's secure key store and can only be used after the fingerprint;
 * the website keeps the public key and checks each signed challenge. The fingerprint never leaves the phone.
 */
class QuickUnlock {

    interface Reply { void send(String type, String value); }

    private static final String ALIAS = "officehub-quick-signin";
    private final FragmentActivity activity;
    private final Reply reply;

    QuickUnlock(FragmentActivity activity, Reply reply) {
        this.activity = activity;
        this.reply = reply;
    }

    /** Fingerprint (strong) on all phones; the phone's screen lock as well on Android 11+. */
    private int authenticators() {
        int strong = BiometricManager.Authenticators.BIOMETRIC_STRONG;
        return Build.VERSION.SDK_INT >= 30 ? strong | BiometricManager.Authenticators.DEVICE_CREDENTIAL : strong;
    }

    /** "ready", "not-enrolled" (no fingerprint or screen lock set) or "unavailable"; and whether a key exists. */
    void status() {
        int r = BiometricManager.from(activity).canAuthenticate(authenticators());
        String s = r == BiometricManager.BIOMETRIC_SUCCESS ? "ready" : r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "not-enrolled" : "unavailable";
        reply.send("bio-status", s + "," + (hasKey() ? "key" : "no-key"));
    }

    /** New key, then the fingerprint signs the website's challenge: reply "publicKey.signature" (base64). */
    void register(String challenge) {
        try {
            KeyStore ks = keyStore();
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
            KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= 30) {
                spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
            }
            KeyPairGenerator kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            kpg.initialize(spec.build());
            PublicKey pub = kpg.generateKeyPair().getPublic();
            String pubB64 = Base64.encodeToString(pub.getEncoded(), Base64.NO_WRAP);
            sign(challenge, "bio-registered", pubB64 + ".");
        } catch (Exception e) {
            reply.send("bio-error", "keystore");
        }
    }

    /** The fingerprint signs the website's challenge: reply "bio-signed" with the signature (base64). */
    void unlock(String challenge) {
        sign(challenge, "bio-signed", "");
    }

    void remove() {
        try {
            KeyStore ks = keyStore();
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception ignored) {
            // nothing to remove
        }
        reply.send("bio-removed", "ok");
    }

    private void sign(String challenge, String okType, String prefix) {
        Signature sig;
        try {
            PrivateKey key = (PrivateKey) keyStore().getKey(ALIAS, null);
            if (key == null) { reply.send("bio-error", "no-key"); return; }
            sig = Signature.getInstance("SHA256withECDSA");
            sig.initSign(key);
        } catch (KeyPermanentlyInvalidatedException e) {
            reply.send("bio-error", "changed");
            return;
        } catch (Exception e) {
            reply.send("bio-error", "keystore");
            return;
        }
        BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                try {
                    Signature s = result.getCryptoObject().getSignature();
                    s.update(challenge.getBytes(StandardCharsets.UTF_8));
                    reply.send(okType, prefix + Base64.encodeToString(s.sign(), Base64.NO_WRAP));
                } catch (Exception e) {
                    reply.send("bio-error", "sign");
                }
            }

            @Override
            public void onAuthenticationError(int code, CharSequence message) {
                boolean cancelled = code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_CANCELED;
                reply.send("bio-error", cancelled ? "cancelled" : code == BiometricPrompt.ERROR_LOCKOUT || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT ? "lockout" : "error-" + code);
            }
        });
        BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("Office Hub")
            .setSubtitle(activity.getString(R.string.bio_subtitle))
            .setAllowedAuthenticators(authenticators());
        if (Build.VERSION.SDK_INT < 30) info.setNegativeButtonText(activity.getString(android.R.string.cancel));
        prompt.authenticate(info.build(), new BiometricPrompt.CryptoObject(sig));
    }

    private boolean hasKey() {
        try {
            return keyStore().containsAlias(ALIAS);
        } catch (Exception e) {
            return false;
        }
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return ks;
    }
}
