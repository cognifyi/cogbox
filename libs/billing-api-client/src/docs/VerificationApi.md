# VerificationApi

All URIs are relative to *https://billing.pazity.com*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**verifyInternetAccess**](#verifyinternetaccess) | **POST** /organization/{organizationId}/verify-internet-access | Verify internet access|

# **verifyInternetAccess**
> verifyInternetAccess(verifyInternetAccess)

Verifies a Stripe Radar session token to unlock unrestricted egress.

### Example

```typescript
import {
    VerificationApi,
    Configuration,
    VerifyInternetAccess
} from './api';

const configuration = new Configuration();
const apiInstance = new VerificationApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let verifyInternetAccess: VerifyInternetAccess; //

const { status, data } = await apiInstance.verifyInternetAccess(
    organizationId,
    verifyInternetAccess
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **verifyInternetAccess** | **VerifyInternetAccess**|  | |
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
|**204** | Verification accepted. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

