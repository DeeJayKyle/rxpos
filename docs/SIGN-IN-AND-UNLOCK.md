# Sign-in and device unlock (2026-11-15)

How staff sign in to RxPOS, and how a device can be unlocked faster after that. A PIN or a fingerprint is a way to
**unlock this device for someone who already signed in here with their password**; it never replaces the first
sign-in, and it never changes anyone's role, permissions or identity.

## Methods

| Method | Where | First set up | Kept where |
|---|---|---|---|
| Password (+ two-step code if on) | Every app, the web | — | Server: the password hash. Each Windows / Android device: a slow, salted PBKDF2 verifier of the password with this device's own salt, only for people who signed in on it. |
| Quick PIN (4–8 digits) | Windows, Android (Flutter); Windows / Android classic app | After a password sign-in on the device, **and the current password typed again** | This device only: PBKDF2 verifier with its own random salt (310,000 rounds). Never synced, never logged. |
| Fingerprint / face (Android), Windows Hello (Windows) | Flutter Windows and Android apps | After a password sign-in, **the current password typed again, then the system's own check** | The system checks the person; RxPOS never sees or keeps biometric data. RxPOS keeps a random 32-byte unlock key in the system's secure storage (Android Keystore through EncryptedSharedPreferences; Windows Credential Manager) and a salted hash of it beside the device's verifiers. Unlocking needs the system check to pass **and** the key in secure storage to match. |

Only the methods a device supports are shown: no fingerprint option on the web, on a phone with no fingerprint or face
enrolled, or on a Windows PC without Windows Hello. Password (and the PIN where set) always stay available as the
fallback; "Forgot password" recovery is unchanged.

## Limits and lockout

- PIN: 5 wrong PINs and the PIN is forgotten on that device; the password is needed.
- Fingerprint / Windows Hello: the system limits tries itself (it locks the sensor after several failures). RxPOS
  turns device unlock off when the key in secure storage is missing or does not match (3 mismatches, or one missing
  key, e.g. after a phone was restored from a backup).
- Offline: a device signs someone in with password, PIN or device unlock only within **30 days** of their last sign-in
  on it with the internet. After that the internet (and the password) is needed.
- Two-step sign-in: a PIN or device unlock works only on a device where the person has already typed their code.

## Changing or removing a method

Setting, changing or removing a PIN, turning device unlock on or off, and changing one's own password (except the forced
change after a temporary password) all ask for the **current password** first. It is checked against this device's
own verifier, so it also works offline. Each change is written to the audit log ("Quick PIN set on a device", "Device
unlock … turned on", …) without any secret.

## Shared devices and other people

- Every PIN and unlock key belongs to one person on one device (`pharmacy:userId`). Signing in with a PIN or device
  unlock starts with typing your own email or username; it can only open that account.
- A fingerprint reader or Windows Hello cannot tell staff apart (anyone enrolled on the device passes). So **only one
  person per device and pharmacy can turn device unlock on**, and no one else can turn it on, or remove it, while it is
  on. On a shared till, staff use their own quick PIN instead.
- Windows Hello checks the Windows user that is signed in to the PC; on a PC everyone uses under one Windows account,
  use PINs.

## Logout, account removal, revocation

- Log out: the session is ended; PINs and device unlock stay on the device so the person can unlock again (within the
  30 days). Nothing about other people is touched.
- A disabled or removed account cannot unlock as soon as the device has synced the change: PIN and device unlock look
  up the account on the device and refuse it. At the next password sign-in on the device (anyone's), the PIN, device
  unlock and offline verifier of every disabled or removed account are deleted, including the unlock key in secure
  storage.
- **Offline limitation**: a device that has not synced since an account was disabled does not know about it yet. Until
  it syncs, that person can still sign in on it with their password, PIN or device unlock, for at most 30 days from
  their last online sign-in on that device. To cut access at once, the device must go online (or be reset).
- New fingerprints / faces enrolled on the device: the system check accepts any enrolled fingerprint or face, so a new
  enrolment on the device can unlock the account that turned device unlock on. This is why it is limited to one
  person per device and recommended only for a personal device. (The packages used do not let RxPOS bind the key to the
  current enrolment; doing so on Android needs a Keystore key with "invalidated by biometric enrolment", which is a
  possible follow-up.)

## The web

Browsers cannot use a phone's or PC's fingerprint reader without a server-side WebAuthn / passkey set-up, which RxPOS
does not have. The web version therefore offers password (and two-step) only, keeps nothing for offline sign-in, and
shows no device PIN or fingerprint option.

## What was not changed

- How the server checks passwords, two-step codes and recovery codes.
- Roles, permissions and staff identities.
- The session token is kept where it was (the app's local database on Windows / Android, the tab on the web). Moving
  it into the system's secure storage is a possible follow-up; it was not done here to avoid signing everyone out and
  changing offline start-up.
