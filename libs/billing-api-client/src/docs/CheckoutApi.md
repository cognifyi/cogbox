# CheckoutApi

All URIs are relative to *https://billing.pazity.com*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getCheckoutUrl**](#getcheckouturl) | **GET** /organization/{organizationId}/checkout-url | Get Stripe checkout URL (v1)|
|[**getV2CheckoutURL**](#getv2checkouturl) | **GET** /v2/organization/{organizationId}/checkout-url | Get Stripe checkout URL (v2)|

# **getCheckoutUrl**
> string getCheckoutUrl()

Returns a Stripe checkout URL for the organization.

### Example

```typescript
import {
    CheckoutApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CheckoutApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getCheckoutUrl(
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
|**200** | Checkout URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getV2CheckoutURL**
> string getV2CheckoutURL()

Returns a Stripe checkout URL for the organization.

### Example

```typescript
import {
    CheckoutApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CheckoutApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getV2CheckoutURL(
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
|**200** | Checkout URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

