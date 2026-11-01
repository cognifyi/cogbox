# UsageApi

All URIs are relative to _https://billing.pazity.com_

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getCurrentUsage**](#getcurrentusage) | **GET** /organization/{organizationId}/usage | Get current usage (v1)|
|[**getPastUsage**](#getpastusage) | **GET** /organization/{organizationId}/usage/past | Get past usage (v1)|
|[**getV2CurrentUsage**](#getv2currentusage) | **GET** /v2/organization/{organizationId}/usage | Get current usage (v2)|
|[**getV2PastUsage**](#getv2pastusage) | **GET** /v2/organization/{organizationId}/usage/past | Get past usage (v2)|
|[**ingestUsageEvents**](#ingestusageevents) | **POST** /v2/usage/events | Ingest usage events|

# **getCurrentUsage**
>
> OrganizationUsage getCurrentUsage()

Returns the current billing period usage.

### Example

```typescript
import {
    UsageApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new UsageApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getCurrentUsage(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**OrganizationUsage**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Current usage. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getPastUsage**
>
> OrganizationUsage getPastUsage()

Returns recent closed billing periods.

### Example

```typescript
import {
    UsageApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new UsageApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let periods: number; //Number of closed periods to return. (optional) (default to 12)

const { status, data } = await apiInstance.getPastUsage(
    organizationId,
    periods
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **periods** | [**number**] | Number of closed periods to return. | (optional) defaults to 12|

### Return type

**OrganizationUsage**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Past usage. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getV2CurrentUsage**
>
> OrganizationUsage getV2CurrentUsage()

Returns the current billing period usage.

### Example

```typescript
import {
    UsageApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new UsageApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)

const { status, data } = await apiInstance.getV2CurrentUsage(
    organizationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|

### Return type

**OrganizationUsage**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Current usage. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getV2PastUsage**
>
> Array<OrganizationUsage> getV2PastUsage()

Returns recent closed billing periods.

### Example

```typescript
import {
    UsageApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new UsageApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let periods: number; //Number of closed periods to return. (optional) (default to 12)

const { status, data } = await apiInstance.getV2PastUsage(
    organizationId,
    periods
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **periods** | [**number**] | Number of closed periods to return. | (optional) defaults to 12|

### Return type

**Array<OrganizationUsage>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Past usage. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **ingestUsageEvents**
>
> UsageEventIngestResult ingestUsageEvents(usageEventBatch)

Batch ingestion of normalized usage events. Events are idempotent on `event_id`; duplicates are reported but do not fail the request.

### Example

```typescript
import {
    UsageApi,
    Configuration,
    UsageEventBatch
} from './api';

const configuration = new Configuration();
const apiInstance = new UsageApi(configuration);

let usageEventBatch: UsageEventBatch; //

const { status, data } = await apiInstance.ingestUsageEvents(
    usageEventBatch
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **usageEventBatch** | **UsageEventBatch**|  | |

### Return type

**UsageEventIngestResult**

### Authorization

[adminKey](../README.md#adminKey)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**202** | Events accepted for processing. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
