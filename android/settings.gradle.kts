// Android-app met een widget voor het lessenrooster (voor Thomas). Gebouwd door .github/workflows/android-widget.yml.
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
        mavenCentral()
    }
}
rootProject.name = "Roosterwidget"
include(":app")
