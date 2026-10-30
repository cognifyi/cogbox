# CouponApi

All URIs are relative to *https://billing.pazity.com*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**redeemCoupon**](#redeemcoupon) | **POST** /organization/{organizationId}/redeem-coupon/{couponCode} | Redeem coupon (v1)|
|[**redeemV2Coupon**](#redeemv2coupon) | **POST** /v2/organization/{organizationId}/redeem-coupon/{couponCode} | Redeem coupon (v2)|

# **redeemCoupon**
> Organization redeemCoupon()

Redeems a coupon for the organization.

### Example

```typescript
import {
    CouponApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CouponApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let couponCode: string; //Coupon code. (default to undefined)

const { status, data } = await apiInstance.redeemCoupon(
    organizationId,
    couponCode
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **couponCode** | [**string**] | Coupon code. | defaults to undefined|


### Return type

**Organization**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated organization. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **redeemV2Coupon**
> { [key: string]: string; } redeemV2Coupon()

Redeems a coupon for the organization.

### Example

```typescript
import {
    CouponApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CouponApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let couponCode: string; //Coupon code. (default to undefined)

const { status, data } = await apiInstance.redeemV2Coupon(
    organizationId,
    couponCode
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **couponCode** | [**string**] | Coupon code. | defaults to undefined|


### Return type

**{ [key: string]: string; }**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Redemption result. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

