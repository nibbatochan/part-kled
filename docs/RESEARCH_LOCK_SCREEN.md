# Research: how a Windows desktop app can set the lock screen picture

Research only. No code or config was changed. Nothing was committed. The lock screen setting on this machine was not changed. Date: 2026-10-31. Branch `master-web`.

Evidence rules:
- "Docs say" = quoted or paraphrased from a Microsoft page, cited as `[n]`. Sources are listed in section 6.
- "Code fact" = read from local files in this repo.
- Anything not confirmed in a primary source is marked **UNVERIFIED**.
- No test was run. `desktop/set-lock.ps1` was read, not executed.

---

## 1. Question

`desktop/set-lock.ps1` calls `UserProfilePersonalizationSettings.TrySetLockScreenImageAsync` from Windows PowerShell 5.1. For an unpackaged app it returns `false` with both PNG and JPEG, with unique file names, a Windows path, and the `IsSupported()` true-path reached. The question has four parts:

1. Does `TrySetLockScreenImageAsync` need package identity (MSIX / packaged app) or a capability?
2. What is the supported route for a Win32 / Electron app to set the lock screen picture?
3. Is a live, animated, or web-content lock screen supported?
4. What is the concrete recommendation for this project?

Code fact: `set-lock.ps1` line 16 passes `[IO.Path]::GetFullPath($Path)` to `StorageFile.GetFileFromPathAsync`. Line 19 checks `IsSupported()`. Line 20 calls `TrySetLockScreenImageAsync($file)`. Line 21 prints the generic `FAIL: Windows refused the lock screen image`. The script receives only a bool and no reason code, so the cause is not visible from the script.

---

## 2. Findings

### 2.1 Does the API need package identity or a capability? (Q1)

**Docs are silent on both.** The method page lists Definition, Parameters, Returns, Attributes, Examples, Remarks and "Applies to". It has no Capabilities section and no statement about packaging [1]. The Requirements table on the class page gives only:

> Device family | Windows 10 (introduced in 10.0.10240.0)
> API contract | Windows.Foundation.UniversalApiContract (introduced in v1.0)

No capability and no package identity requirement is listed [2].

The exact text of the method description and return value [1]:

> Attempts to set the specified image file as the lock screen background image.

> The result of the async operation. **true** if the background image was set successfully; otherwise, **false**.

The only remarks are about mobile file size and about reusing a file name [1]:

> When you set an image more than once, the new image file must have a different name than the previously set image. If you set a new image using a file with the same name as the previous image, it will fail.

The class page's `IsSupported()` description reads "Gets a value that indicates whether changing the desktop and lock screen images is supported on the current device" [2].

**Indirect hints, not requirements:**

- The sample on both pages uses `StorageFile.GetFileFromApplicationUriAsync` with a `ms-appx:///Local/` URI [1][2]. That URI is package-relative, so the sample is written for a packaged app. The docs do not say the API needs it.
- The Learn packaging overview says: "If you're unpackaged and hitting `E_ILLEGAL_METHOD_CALL` or `APPMODEL_ERROR_NO_PACKAGE` errors when calling Windows APIs, that's the package identity requirement." [4]. That statement is general. It names no API, and this API does not throw those errors. It returns `false`. So the rule is not known to apply here. **UNVERIFIED** whether a `false` return is the identity failure mode for this API.
- The Learn list of features that need package identity [3] does not include lock screen, wallpaper, or `UserProfilePersonalizationSettings`. The list is: background tasks, Windows AI APIs, push notifications, share target, context menu extensions, file and protocol associations, startup tasks, app services [3]. Its absence from the list is evidence, not proof, because the list is described as covering "certain Windows Runtime APIs" in general [3].

**Public reports:** the only public report I found is a WinDynamicDesktop issue. It says a UWP attempt "doesn't work, the image changes only once and stays the same afterwards" (maintainer comment, Jan 2020). A later commenter reports that a WPF app calling `LockScreen.SetImageFileAsync` from a separate process, started by a PowerShell script, works for them. That comment was not verified by the maintainer [5]. A search also returned a gist that calls `LockScreen.SetImageFileAsync`, not `TrySetLockScreenImageAsync`, from a command-line tool [6]. I did not fetch the gist; it was seen in search results only. No source found says that `TrySetLockScreenImageAsync` works or fails in an unpackaged process.

**Conclusion for Q1:** no capability is documented. The documentation does not say that package identity is required. It also does not say that it is not required. A `false` return with no reason is consistent with several causes, listed in 2.4. Whether identity is the cause is **UNVERIFIED**.

### 2.2 Supported routes for a Win32 / Electron app (Q2)

| Route | Status | Source | Notes |
| --- | --- | --- | --- |
| Full MSIX packaging | Supported | [4] | Gives package identity. Store eligible. Replaces the installer. Build path for Electron is **UNVERIFIED**. |
| Packaging with external location (sparse package) | Supported by Microsoft for granting identity to a Win32 app | [6] | Adds a small identity package. Keeps the existing installer and binaries. Needs a signed package and a trusted certificate. Whether it unlocks *this* API is **UNVERIFIED**. |
| Windows App SDK | Not checked in depth | [3] | The Windows App SDK pages reviewed do not name a lock screen API. **UNVERIFIED** whether it has one. |
| Policy / Personalization CSP | Supported, but limited | [7] | See below. Not a general route for a personal Pro machine. |
| Registry writes | Not documented | none | No Microsoft source found for a supported registry value that sets the lock screen image. Not recommended. |
| Documented user action | Supported | [8] | User picks Picture or Slideshow in Settings. |

**Policy route.** The Personalization CSP can set the lock screen image. The doc says: "The Personalization CSP can set the lock screen, desktop background images and company branding on sign-in screen." It also says: "Setting these policies also prevents the user from changing the image." It is supported on Enterprise and Education, and on Pro only with SharedPC settings [7]. This is for IT management, not a per-user app setting.

**User-action route.** Microsoft's support page describes these lock screen options: "Windows spotlight", "Picture: select a single image as your lock screen background", and "Slideshow: use a slideshow of images from a folder on your device" [8]. The app cannot make the user do this, but it can prepare a file and tell the user where to pick it. The Settings deep-link is **UNVERIFIED** (not checked in this research).

**Electron specifics.** No Microsoft page reviewed says how an Electron main process should obtain identity. The practical path is a small helper executable with identity, launched by the Electron main process. This is a design inference, **UNVERIFIED** as a working pattern.

### 2.3 Live, animated, or web lock screen (Q3)

**Not supported.** Microsoft's lock screen page lists three options and no others: Windows Spotlight, Picture, and Slideshow [8]. Spotlight is described as "a rotating set of images from Microsoft" [8]. None of the three is a live, animated, video, or web surface. The support page does not mention animated, live, video, or web content [8].

The API takes one `StorageFile` image and returns a bool. It has no animation, video, or web surface [1]. The remarks say a repeat set needs a new file name [1]. A timed "frame stepping" approach that sets a new still every few seconds is possible in principle. Its behaviour, rate limits, and user experience are **UNVERIFIED**, and it is not a supported design. Do not build on it.

### 2.4 Why the set-lock script returns false (diagnosis, read-only)

Possible causes, none confirmed:

1. **Identity.** The call runs in an unpackaged `powershell.exe` process. This would match the general statement in [4]. **UNVERIFIED** for this API.
2. **File location.** The Learn sample uses an app-package-relative `ms-appx:///Local/` file [1]. A public answer says the image must be copied to the app's LocalFolder first [9]. This source is a Stack Overflow mirror seen in search results only, and it was not fetched. **UNVERIFIED** whether it matters for an absolute path. `set-lock.ps1` uses an absolute path, not a LocalFolder file.
3. **Policy.** A group policy or CSP can set and lock the lock screen image [7]. The script would then see `false`. **UNVERIFIED** which policy key, if any, is set on this machine. A read-only check is the next step.
4. **Session or device state.** The docs say nothing about this. **UNVERIFIED**.

The script can tell these apart only by adding diagnostics (for example the `HResult` from a rejected call, or a helper with identity). The current script does not log an HRESULT for a `false` return.

---

## 3. Recommendation

### 3.1 Summary

Do not rely on the unpackaged call. Do not rely on registry writes. Do this, in order:

1. **Read-only check (now).** Confirm no policy locks the lock screen on the dev machine. Do not change anything. Do not run `set-lock.ps1` against the real lock screen.
2. **Spike a sparse-packaged helper (test account or VM only).** Build a small identity-bearing helper exe that calls `TrySetLockScreenImageAsync` with a `StorageFile` from a path it can read. Register it with `Add-AppxPackage -ExternalLocation` (per-user). If it returns `true`, go to step 3. If not, go to step 4.
3. **Integrate.** The Electron main process starts the helper. The installer registers the identity package. Keep the static image and the unique file name rule.
4. **Fallback (if step 2 fails).** Save the image to a known folder and show the user how to pick it in Settings (Picture or Slideshow) [8]. Keep this as the documented route. Do not add registry or undocumented writes.

### 3.2 Steps for the spike

1. Create a minimal helper (C# or C++/WinRT). Add a `Package.appxmanifest`-style identity manifest per [6]: `Identity Name`, `Publisher` (matching the signing cert), `Version`, `ProcessorArchitecture="neutral"`, `AllowExternalContent`, and a `runFullTrust` capability.
2. Build with `MakeAppx.exe pack /nv` and sign with `SignTool` [6].
3. For a self-signed dev cert, import the public `.cer` to `Cert:\CurrentUser\TrustedPeople` [6].
4. Register with `Add-AppxPackage -Path <msix> -ExternalLocation <install dir>` (per-user, no admin) [6].
5. In the helper, call `TrySetLockScreenImageAsync` with a file path and a new file name. Log the return value and any exception HRESULT.
6. Test on a test user or VM only.

### 3.3 Cost

- Engineering: one helper exe, one manifest, one signing step, one installer hook. Estimate: not measured.
- Certificate: a self-signed cert for development is free. Distribution to other machines needs a trusted certificate. The packaging overview names Azure Artifact Signing as a lower-cost option [4]. Price **UNVERIFIED** (not checked).
- Runtime: small. The helper runs only when the user asks.

### 3.4 Risks

- The spike may still return `false`. Then the fallback is the only route, and the lock screen cannot be set automatically from this app.
- Self-signed certs need trust import (per-user or machine). Production certs need a trusted CA [6].
- A new package version must be higher. The same version cannot be re-registered without unregistering first [6].
- Electron updates must keep the helper and identity package in sync.
- Policy may lock the lock screen on managed machines [7]. The app must detect this and tell the user.
- Animated or live lock screens are out of scope (section 2.3).

---

## 4. What not to do

- Do not write to the lock screen image cache or any registry value without a Microsoft source. The result is undocumented and can break on any update.
- Do not run `desktop/set-lock.ps1` against the real lock screen to test. Use a test account or VM.
- Do not promise animated or web content on the lock screen.

---

## 5. Open questions (UNVERIFIED)

1. Does `TrySetLockScreenImageAsync` succeed from a sparse-packaged helper? (Needs the spike.)
2. Does a `false` return correspond to a specific HRESULT that a helper can log?
3. Is there a Windows App SDK API for the lock screen? (Not checked.)
4. Which policy key, if any, locks the lock screen on this machine? (Read-only check.)
5. Does the ms-settings deep link for the lock screen page work on Windows 11? (Not checked.)
6. Does a `ms-appx:///Local/` file behave differently from an absolute path for this API? (Needs the spike.)

---

## 6. Sources

[1] UserProfilePersonalizationSettings.TrySetLockScreenImageAsync method (winrt-28000). https://learn.microsoft.com/en-us/uwp/api/windows.system.userprofile.userprofilepersonalizationsettings.trysetlockscreenimageasync
[2] UserProfilePersonalizationSettings class. https://learn.microsoft.com/en-us/uwp/api/windows.system.userprofile.userprofilepersonalizationsettings
[3] Modernize packaged desktop apps (features that require package identity). https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/modernize-packaged-apps
[4] Packaging overview (unpackaged apps, E_ILLEGAL_METHOD_CALL / APPMODEL_ERROR_NO_PACKAGE tip, sparse packaging). https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/packaging/
[5] WinDynamicDesktop issue #31 "Automatic change lock screen". https://github.com/t1m0thyj/WinDynamicDesktop/issues/31
[6] Grant package identity by packaging with external location manually. https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps
[7] Personalization CSP. https://learn.microsoft.com/en-us/windows/client-management/mdm/personalization-csp
[8] Customize the lock screen in Windows (Microsoft Support). https://support.microsoft.com/help/17185
[9] Stack Overflow mirror "UWP release build crashes but not in Visual Studio" (search snippet only, not fetched). https://windows-hexerror.linestarve.com/q/so35931399-uwp-release-build-crashes-but-not-in-visual-studio

Also seen, not fetched: package identity overview [10] https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/package-identity-overview (fetched, no statement about this API); Windows-universal-samples Personalization sample https://github.com/LanceMcCarthy/Windows-universal-samples/blob/master/Samples/Personalization (fetched, summary only: does not name `TrySetLockScreenImageAsync` or identity); gist https://gist.github.com/barrkel/cadbe8bde8adc3488539953ed208032a (search snippet only).
