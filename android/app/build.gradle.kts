plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.particledepth.wallpaper"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.particledepth.wallpaper"
        minSdk = 29 // PROPOSED in docs/RESEARCH_ANDROID_LIVE_WALLPAPER.md; version table was unreadable, revisit in phase 1
        targetSdk = 34
        versionCode = 1
        versionName = "0.0.1-phase0"
    }

    buildTypes {
        release {
            // R8 shrinks code and resources. No reflection is used (the pack parser reads org.json by name, which is
            // built into Android), so the default Android rules are enough; see proguard-rules.pro.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signing: set PDS_KEYSTORE, PDS_KEYSTORE_PASSWORD, PDS_KEY_ALIAS and PDS_KEY_PASSWORD in the environment to sign.
            // Without them the build is unsigned and cannot be installed: that is intended, no key is stored in the repo.
            val ks = System.getenv("PDS_KEYSTORE")
            if (ks != null) {
                signingConfig = signingConfigs.create("release") {
                    storeFile = file(ks)
                    storePassword = System.getenv("PDS_KEYSTORE_PASSWORD")
                    keyAlias = System.getenv("PDS_KEY_ALIAS")
                    keyPassword = System.getenv("PDS_KEY_PASSWORD")
                }
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14" // pairs with Kotlin 1.9.24
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")

    // App UI: Compose foundation only, no Material look. The controls are drawn from the web studio's tokens (ui/Theme.kt).
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.9.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20231013") // the Android build has org.json built in; unit tests run on the plain JVM
}
