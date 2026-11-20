plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val previewKeystorePath = providers.environmentVariable("FINANZAS_PREVIEW_KEYSTORE_PATH").orNull
val previewKeystorePassword = providers.environmentVariable("FINANZAS_PREVIEW_KEYSTORE_PASSWORD").orNull
val previewKeyAlias = providers.environmentVariable("FINANZAS_PREVIEW_KEY_ALIAS").orNull
val previewKeyPassword = providers.environmentVariable("FINANZAS_PREVIEW_KEY_PASSWORD").orNull
val hasPersistentPreviewSigning = listOf(
    previewKeystorePath,
    previewKeystorePassword,
    previewKeyAlias,
    previewKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "com.finanzas.companion"
    compileSdk = 36

    defaultConfig {
        // A separate application ID lets the full APK be tested without overwriting
        // the currently installed personal connector or its encrypted local captures.
        applicationId = "com.finanzas.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 19
        versionName = "1.0.18-preview"

        // Public Supabase values only. RLS remains the security boundary.
        buildConfigField("String", "SUPABASE_URL", "\"https://xebgscmovaffrqckzpyz.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_Mbxk3dAMZHoPKrh90zKHkw_yzzh22un\"")
    }

    signingConfigs {
        if (hasPersistentPreviewSigning) {
            create("preview") {
                storeFile = file(checkNotNull(previewKeystorePath))
                storePassword = checkNotNull(previewKeystorePassword)
                keyAlias = checkNotNull(previewKeyAlias)
                keyPassword = checkNotNull(previewKeyPassword)
            }
        }
    }

    buildTypes {
        // Debug APKs are always isolated from Production so personal testing
        // can never write into the live financial database.
        getByName("debug") {
            // CI supplies a persistent Preview key from protected GitHub Actions secrets.
            // Local developer builds keep the normal Android debug key when no Preview key is configured.
            if (hasPersistentPreviewSigning) {
                signingConfig = signingConfigs.getByName("preview")
            }
            buildConfigField("String", "SUPABASE_URL", "\"https://brkckgaicoqkqdcwwftm.supabase.co\"")
            buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_4aTVOdrHyro5iyDctv1mjg__yI6jqh-\"")
        }
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
    implementation(project(":capacitor-local-notifications"))
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    testImplementation("junit:junit:4.13.2")
}
