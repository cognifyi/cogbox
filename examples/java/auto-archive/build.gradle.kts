plugins {
    application
}

group = "io.cogbox.examples"
version = "0.1.0"

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

repositories {
    mavenLocal()
    mavenCentral()
}

dependencies {
    implementation("io.cogbox:sdk-java")
}

application {
    mainClass.set("io.cogbox.examples.AutoArchive")
}
