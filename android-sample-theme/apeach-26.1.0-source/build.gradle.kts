import com.android.build.gradle.internal.dsl.BaseAppModuleExtension
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.7.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }

    apply(plugin = "com.android.application")
    apply(plugin = "kotlin-android")
    tasks.withType<KotlinCompile>().configureEach {
        kotlinOptions {
            jvmTarget = "17"
        }
    }

    plugins.withId("com.android.application") {
        extensions.configure<BaseAppModuleExtension> {
            namespace = "com.kakao.talk.theme.apeach"

            compileSdk = 35
            buildToolsVersion = "35.0.0"

            defaultConfig {
                minSdk = 28
                targetSdk = 35

                versionName = "1.0.0"
                versionCode = 100
                applicationId = "com.kakao.talk.theme.template"

                sourceSets {
                    getByName("main") {
                        res.srcDirs("src/main/theme", "src/main/theme-adv")
                    }
                }
            }

            compileOptions {
                sourceCompatibility = JavaVersion.VERSION_17
                targetCompatibility = JavaVersion.VERSION_17
            }

            buildFeatures {
                viewBinding = true
            }

            dependencies.add("implementation", "org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25")
            dependencies.add("implementation", "androidx.annotation:annotation:1.9.1")
        }
    }
}
