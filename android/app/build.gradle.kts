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
            isMinifyEnabled = false
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
