# TierApi

All URIs are relative to _https://billing.pazity.com_

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**downgradeTier**](#downgradetier) | **POST** /organization/{organizationId}/tier/downgrade | Downgrade organization tier|
|[**getTier**](#gettier) | **GET** /organization/{organizationId}/tier | Get organization tier|
|[**listTiers**](#listtiers) | **GET** /tier | List tiers|
|[**upgradeTier**](#upgradetier) | **POST** /organization/{organizationId}/tier/upgrade | Upgrade organization tier|

# **downgradeTier**
>
> downgradeTier(organizationTierUpdate)

Requests a tier downgrade.

### Example

```typescript
import {
    TierApi,
    Configuration,
    OrganizationTierUpdate
} from './api';

const configuration = new Configuration();
const apiInstance = new TierApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let organizationTierUpdate: OrganizationTierUpdate; //

const { status, data } = await apiInstance.downgradeTier(
    organizationId,
    organizationTierUpdate
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationTierUpdate** | **OrganizationTierUpdate**|  | |
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
|**204** | Tier downgrade accepted. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getTier**
>
> OrganizationTier getTier()

Returns the organization\'s current tier and verification state.

### Example

```typescript
import {
    TierApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new TierApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getTier(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**OrganizationTier**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Organization tier. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listTiers**
>
> Array<Tier> listTiers()

Returns the public tier catalog.

### Example

```typescript
import {
    TierApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new TierApi(configuration);

const { status, data } = await apiInstance.listTiers();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**Array<Tier>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Tier catalog. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **upgradeTier**
>
> upgradeTier(organizationTierUpdate)

Requests a tier upgrade.

### Example

```typescript
import {
    TierApi,
    Configuration,
    OrganizationTierUpdate
} from './api';

const configuration = new Configuration();
const apiInstance = new TierApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let organizationTierUpdate: OrganizationTierUpdate; //

const { status, data } = await apiInstance.upgradeTier(
    organizationId,
    organizationTierUpdate
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationTierUpdate** | **OrganizationTierUpdate**|  | |
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
|**204** | Tier upgrade accepted. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
