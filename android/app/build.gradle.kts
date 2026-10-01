plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.misterklus.lessenrooster"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.misterklus.lessenrooster.thomas"
        minSdk = 26
        targetSdk = 34
        // Elke build op GitHub krijgt een hoger nummer, zodat een nieuwe versie over de oude installeert
        versionCode = (System.getenv("VERSION_CODE") ?: System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt() // VERSION_CODE: alleen voor de meldingentest
        versionName = "1.$versionCode"
    }

    // Ondertekenen met de vaste sleutel (GitHub-geheim), anders kan een update niet over de oude versie
    signingConfigs {
        create("release") {
            val keystore = System.getenv("KEYSTORE_FILE")
            if (keystore != null) {
                storeFile = file(keystore)
                storeType = "pkcs12"
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = "widget"
                keyPassword = System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
    }
}
