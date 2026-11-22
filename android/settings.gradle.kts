pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // Capacitor's Android module declares repositories in its build script.
    // PREFER_SETTINGS keeps the central repository and mirror configuration authoritative
    // without failing when the Capacitor library declares its own fallback repositories.
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        maven {
            url = uri("https://maven-central.storage-download.googleapis.com/maven2")
        }
        mavenCentral()
    }
}

rootProject.name = "FinanzasMobile"
include(":app", ":capacitor-android")
project(":capacitor-android").projectDir = file("../node_modules/@capacitor/android/capacitor")

include(":capacitor-local-notifications")
project(":capacitor-local-notifications").projectDir = file("../node_modules/@capacitor/local-notifications/android")

include(":capacitor-push-notifications")
project(":capacitor-push-notifications").projectDir = file("../node_modules/@capacitor/push-notifications/android")
