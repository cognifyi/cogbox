# PortalApi

All URIs are relative to _https://billing.pazity.com_

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getPortalUrl**](#getportalurl) | **GET** /organization/{organizationId}/portal-url | Get Stripe portal URL (v1)|
|[**getV2PortalURL**](#getv2portalurl) | **GET** /v2/organization/{organizationId}/portal-url | Get Stripe portal URL (v2)|

# **getPortalUrl**
>
> string getPortalUrl()

Returns a short-lived Stripe customer portal URL.

### Example

```typescript
import {
    PortalApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PortalApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getPortalUrl(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**string**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: text/plain

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Portal URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getV2PortalURL**
>
> string getV2PortalURL()

Returns a short-lived Stripe customer portal URL.

### Example

```typescript
import {
    PortalApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PortalApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getV2PortalURL(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**string**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: text/plain

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Portal URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
