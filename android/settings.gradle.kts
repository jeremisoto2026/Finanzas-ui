pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Google-hosted Maven Central mirror as a fallback for transient Central errors.
        maven {
            url = uri("https://maven-central.storage-download.googleapis.com/maven2")
        }
        mavenCentral()
    }
}

rootProject.name = "FinanzasCompanion"
include(":app")
