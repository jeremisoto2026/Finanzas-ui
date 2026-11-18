plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.finanzas.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.finanzas.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-personal"

        // This is a public Supabase publishable key. RLS remains the security boundary.
        buildConfigField("String", "SUPABASE_URL", "\"https://xebgscmovaffrqckzpyz.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_Mbxk3dAMZHoPKrh90zKHkw_yzzh22un\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isIncludeAndroidResources = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    testImplementation("junit:junit:4.13.2")
}
