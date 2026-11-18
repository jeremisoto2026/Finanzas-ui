plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.finanzas.companion"
    compileSdk = 36

    defaultConfig {
        // A separate application ID lets the full APK be tested without overwriting
        // the currently installed personal connector or its encrypted local captures.
        applicationId = "com.finanzas.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.0.2-preview"

        // Public Supabase values only. RLS remains the security boundary.
        buildConfigField("String", "SUPABASE_URL", "\"https://xebgscmovaffrqckzpyz.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_Mbxk3dAMZHoPKrh90zKHkw_yzzh22un\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = "21"
    }

    testOptions {
        unitTests.isIncludeAndroidResources = false
    }
}

dependencies {
    implementation(project(":capacitor-android"))
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    testImplementation("junit:junit:4.13.2")
}
