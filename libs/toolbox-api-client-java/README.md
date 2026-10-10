# Cogbox Toolbox API Client for Java

Auto-generated Java client for the [Cogbox](https://cogbox.pazity.com) Toolbox API (file system, process, git, LSP, and other sandbox-internal operations). This library is used internally by the [Cogbox Java SDK](https://central.sonatype.com/artifact/io.cogbox/sdk) and is not intended for direct use.

## Usage

If you're building applications with Cogbox, use the [Cogbox Java SDK](https://central.sonatype.com/artifact/io.cogbox/sdk) instead — it provides a higher-level, idiomatic Java interface.

```kotlin
dependencies {
    implementation("io.cogbox:sdk:<version>")
}
```

## Generation

This client is generated from the Cogbox Toolbox OpenAPI specification using [OpenAPI Generator](https://openapi-generator.tech):

```bash
yarn nx run toolbox-api-client-java:generate:api-client
```

Do not edit the generated source files manually — changes will be overwritten on regeneration.

## License

Apache License 2.0 — see [LICENSE](https://github.com/cognifyi/cogbox/blob/main/libs/sdk-java/LICENSE) for details.
