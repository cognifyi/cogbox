# EmailApi

All URIs are relative to _https://billing.pazity.com_

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**addOrganizationEmail**](#addorganizationemail) | **POST** /organization/{organizationId}/email | Add organization email|
|[**deleteOrganizationEmail**](#deleteorganizationemail) | **DELETE** /organization/{organizationId}/email | Delete organization email|
|[**listOrganizationEmails**](#listorganizationemails) | **GET** /organization/{organizationId}/email | List organization emails|
|[**resendVerificationEmail**](#resendverificationemail) | **POST** /organization/{organizationId}/email/resend | Resend verification email|
|[**verifyEmail**](#verifyemail) | **POST** /organization/{organizationId}/email/verify | Verify email|

# **addOrganizationEmail**
>
> OrganizationEmail addOrganizationEmail(updateOrganizationEmail)

Adds a billing email and sends a verification message.

### Example

```typescript
import {
    EmailApi,
    Configuration,
    UpdateOrganizationEmail
} from './api';

const configuration = new Configuration();
const apiInstance = new EmailApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let updateOrganizationEmail: UpdateOrganizationEmail; //

const { status, data } = await apiInstance.addOrganizationEmail(
    organizationId,
    updateOrganizationEmail
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateOrganizationEmail** | **UpdateOrganizationEmail**|  | |
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**OrganizationEmail**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Added email. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteOrganizationEmail**
>
> deleteOrganizationEmail(updateOrganizationEmail)

Removes a billing email.

### Example

```typescript
import {
    EmailApi,
    Configuration,
    UpdateOrganizationEmail
} from './api';

const configuration = new Configuration();
const apiInstance = new EmailApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let updateOrganizationEmail: UpdateOrganizationEmail; //

const { status, data } = await apiInstance.deleteOrganizationEmail(
    organizationId,
    updateOrganizationEmail
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateOrganizationEmail** | **UpdateOrganizationEmail**|  | |
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Email removed. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listOrganizationEmails**
>
> Array<OrganizationEmail> listOrganizationEmails()

Returns billing emails for the organization.

### Example

```typescript
import {
    EmailApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmailApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.listOrganizationEmails(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**Array<OrganizationEmail>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Organization emails. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **resendVerificationEmail**
>
> resendVerificationEmail(updateOrganizationEmail)

Resends the verification message for an email.

### Example

```typescript
import {
    EmailApi,
    Configuration,
    UpdateOrganizationEmail
} from './api';

const configuration = new Configuration();
const apiInstance = new EmailApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let updateOrganizationEmail: UpdateOrganizationEmail; //

const { status, data } = await apiInstance.resendVerificationEmail(
    organizationId,
    updateOrganizationEmail
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateOrganizationEmail** | **UpdateOrganizationEmail**|  | |
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Verification email resent. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **verifyEmail**
>
> verifyEmail(verifyEmail)

Verifies a billing email with the token from the email.

### Example

```typescript
import {
    EmailApi,
    Configuration,
    VerifyEmail
} from './api';

const configuration = new Configuration();
const apiInstance = new EmailApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let verifyEmail: VerifyEmail; //

const { status, data } = await apiInstance.verifyEmail(
    organizationId,
    verifyEmail
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **verifyEmail** | **VerifyEmail**|  | |
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Email verified. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
