rootProject.name = "auto-delete"

dependencyResolutionManagement {
    repositories {
        mavenLocal()
        mavenCentral()
    }
}

includeBuild("../../../libs/sdk-java") {
    dependencySubstitution {
        substitute(module("io.cogbox:sdk-java")).using(project(":"))
    }
}
