# BillingInfoApi

All URIs are relative to *https://billing.pazity.com*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getV2BillingInfo**](#getv2billinginfo) | **GET** /v2/organization/{organizationId}/billing-info | Get billing info|
|[**getV2BillingSummary**](#getv2billingsummary) | **GET** /v2/organization/{organizationId}/billing-summary | Get billing summary|
|[**listV2Charges**](#listv2charges) | **GET** /v2/organization/{organizationId}/charges | List Stripe charges|
|[**listV2PaymentMethods**](#listv2paymentmethods) | **GET** /v2/organization/{organizationId}/payment-methods | List payment methods|

# **getV2BillingInfo**
> BillingInfo getV2BillingInfo()

Returns billing name, email, phone and address.

### Example

```typescript
import {
    BillingInfoApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BillingInfoApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getV2BillingInfo(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|


### Return type

**BillingInfo**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Billing info. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getV2BillingSummary**
> BillingSummary getV2BillingSummary()

Console summary with balance, current period estimate and suspension state.

### Example

```typescript
import {
    BillingInfoApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BillingInfoApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getV2BillingSummary(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|


### Return type

**BillingSummary**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Billing summary. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listV2Charges**
> ChargeList listV2Charges()

Lists successful and failed Stripe charges.

### Example

```typescript
import {
    BillingInfoApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BillingInfoApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let limit: number; //Page size (1-100, default 25). (optional) (default to 25)
let startingAfter: string; //Stripe cursor (charge ID) to paginate after. (optional) (default to undefined)

const { status, data } = await apiInstance.listV2Charges(
    organizationId,
    limit,
    startingAfter
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **limit** | [**number**] | Page size (1-100, default 25). | (optional) defaults to 25|
| **startingAfter** | [**string**] | Stripe cursor (charge ID) to paginate after. | (optional) defaults to undefined|


### Return type

**ChargeList**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Charge list. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listV2PaymentMethods**
> Array<PaymentMethod> listV2PaymentMethods()

Lists card payment methods attached to the Stripe customer.

### Example

```typescript
import {
    BillingInfoApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BillingInfoApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.listV2PaymentMethods(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|


### Return type

**Array<PaymentMethod>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment methods. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

