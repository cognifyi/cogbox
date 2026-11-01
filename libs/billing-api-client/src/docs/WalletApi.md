# WalletApi

All URIs are relative to _https://billing.pazity.com_

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getV2Wallet**](#getv2wallet) | **GET** /v2/organization/{organizationId}/wallet | Get organization wallet (v2)|
|[**getWallet**](#getwallet) | **GET** /organization/{organizationId}/wallet | Get organization wallet (v1)|
|[**setAutomaticTopUp**](#setautomatictopup) | **PUT** /organization/{organizationId}/wallet/automatic-top-up | Set automatic top-up (v1)|
|[**setV2AutomaticTopUp**](#setv2automatictopup) | **PUT** /v2/organization/{organizationId}/wallet/automatic-top-up | Set automatic top-up (v2)|
|[**topUpV2Wallet**](#topupv2wallet) | **POST** /v2/organization/{organizationId}/wallet/top-up | Create wallet top-up (v2)|
|[**topUpWallet**](#topupwallet) | **POST** /organization/{organizationId}/wallet/top-up | Create wallet top-up (v1)|

# **getV2Wallet**
>
> OrganizationWallet getV2Wallet()

Returns the wallet balance and automatic top-up configuration.

### Example

```typescript
import {
    WalletApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new WalletApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getV2Wallet(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**OrganizationWallet**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Organization wallet. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getWallet**
>
> OrganizationWallet getWallet()

Returns the wallet balance and automatic top-up configuration.

### Example

```typescript
import {
    WalletApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new WalletApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getWallet(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**OrganizationWallet**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Organization wallet. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setAutomaticTopUp**
>
> setAutomaticTopUp(automaticTopUp)

Enables, updates or disables automatic wallet top-up.

### Example

```typescript
import {
    WalletApi,
    Configuration,
    AutomaticTopUp
} from './api';

const configuration = new Configuration();
const apiInstance = new WalletApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let automaticTopUp: AutomaticTopUp; //

const { status, data } = await apiInstance.setAutomaticTopUp(
    organizationId,
    automaticTopUp
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **automaticTopUp** | **AutomaticTopUp**|  | |
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
|**204** | Automatic top-up updated. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setV2AutomaticTopUp**
>
> setV2AutomaticTopUp(automaticTopUp)

Enables, updates or disables automatic wallet top-up.

### Example

```typescript
import {
    WalletApi,
    Configuration,
    AutomaticTopUp
} from './api';

const configuration = new Configuration();
const apiInstance = new WalletApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let automaticTopUp: AutomaticTopUp; //

const { status, data } = await apiInstance.setV2AutomaticTopUp(
    organizationId,
    automaticTopUp
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **automaticTopUp** | **AutomaticTopUp**|  | |
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
|**204** | Automatic top-up updated. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **topUpV2Wallet**
>
> PaymentUrl topUpV2Wallet(walletTopUpRequest)

Creates a Stripe payment link for a wallet top-up.

### Example

```typescript
import {
    WalletApi,
    Configuration,
    WalletTopUpRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new WalletApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let walletTopUpRequest: WalletTopUpRequest; //

const { status, data } = await apiInstance.topUpV2Wallet(
    organizationId,
    walletTopUpRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **walletTopUpRequest** | **WalletTopUpRequest**|  | |
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**PaymentUrl**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **topUpWallet**
>
> PaymentUrl topUpWallet(walletTopUpRequest)

Creates a Stripe payment link for a wallet top-up.

### Example

```typescript
import {
    WalletApi,
    Configuration,
    WalletTopUpRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new WalletApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let walletTopUpRequest: WalletTopUpRequest; //

const { status, data } = await apiInstance.topUpWallet(
    organizationId,
    walletTopUpRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **walletTopUpRequest** | **WalletTopUpRequest**|  | |
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**PaymentUrl**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
