rootProject.name = "sdk-java"

includeBuild("../api-client-java") {
    name = "api-client"
    dependencySubstitution {
        substitute(module("io.cogbox:api-client")).using(project(":"))
    }
}

includeBuild("../toolbox-api-client-java") {
    name = "toolbox-api-client"
    dependencySubstitution {
        substitute(module("io.cogbox:toolbox-api-client")).using(project(":"))
    }
}
