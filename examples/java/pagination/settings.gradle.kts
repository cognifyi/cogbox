rootProject.name = "pagination"

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
