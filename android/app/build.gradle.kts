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
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20231013") // the Android build has org.json built in; unit tests run on the plain JVM
}
