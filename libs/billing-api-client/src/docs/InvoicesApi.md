# InvoicesApi

All URIs are relative to _https://billing.pazity.com_

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createPaymentUrl**](#createpaymenturl) | **POST** /organization/{organizationId}/invoices/{invoiceId}/payment-url | Create invoice payment URL (v1)|
|[**createV2PaymentURL**](#createv2paymenturl) | **POST** /v2/organization/{organizationId}/invoices/{invoiceId}/payment-url | Create invoice payment URL (v2)|
|[**listInvoices**](#listinvoices) | **GET** /organization/{organizationId}/invoices | List invoices (v1)|
|[**listV2Invoices**](#listv2invoices) | **GET** /v2/organization/{organizationId}/invoices | List invoices (v2)|
|[**voidInvoice**](#voidinvoice) | **POST** /organization/{organizationId}/invoices/{invoiceId}/void | Void invoice|

# **createPaymentUrl**
>
> PaymentUrl createPaymentUrl()

Creates a Stripe payment link for an outstanding invoice.

### Example

```typescript
import {
    InvoicesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InvoicesApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let invoiceId: string; //Invoice identifier. (default to undefined)

const { status, data } = await apiInstance.createPaymentUrl(
    organizationId,
    invoiceId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **invoiceId** | [**string**] | Invoice identifier. | defaults to undefined|

### Return type

**PaymentUrl**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createV2PaymentURL**
>
> PaymentUrl createV2PaymentURL()

Creates a Stripe payment link for an outstanding invoice.

### Example

```typescript
import {
    InvoicesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InvoicesApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let invoiceId: string; //Invoice identifier. (default to undefined)

const { status, data } = await apiInstance.createV2PaymentURL(
    organizationId,
    invoiceId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **invoiceId** | [**string**] | Invoice identifier. | defaults to undefined|

### Return type

**PaymentUrl**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment URL. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listInvoices**
>
> PaginatedTInvoice listInvoices()

Returns a paginated invoice list.

### Example

```typescript
import {
    InvoicesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InvoicesApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let page: number; //Page number (1-based). (optional) (default to 1)
let perPage: number; //Page size. (optional) (default to 20)

const { status, data } = await apiInstance.listInvoices(
    organizationId,
    page,
    perPage
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **page** | [**number**] | Page number (1-based). | (optional) defaults to 1|
| **perPage** | [**number**] | Page size. | (optional) defaults to 20|

### Return type

**PaginatedTInvoice**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Paginated invoices. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listV2Invoices**
>
> PaginatedTInvoice listV2Invoices()

Returns a paginated invoice list.

### Example

```typescript
import {
    InvoicesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InvoicesApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let page: number; //Page number (1-based). (optional) (default to 1)
let perPage: number; //Page size. (optional) (default to 20)

const { status, data } = await apiInstance.listV2Invoices(
    organizationId,
    page,
    perPage
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **page** | [**number**] | Page number (1-based). | (optional) defaults to 1|
| **perPage** | [**number**] | Page size. | (optional) defaults to 20|

### Return type

**PaginatedTInvoice**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Paginated invoices. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **voidInvoice**
>
> voidInvoice()

Voids an unpaid invoice.

### Example

```typescript
import {
    InvoicesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InvoicesApi(configuration);

let organizationId: string; //Organization identifier. (default to undefined)
let invoiceId: string; //Invoice identifier. (default to undefined)

const { status, data } = await apiInstance.voidInvoice(
    organizationId,
    invoiceId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **organizationId** | [**string**] | Organization identifier. | defaults to undefined|
| **invoiceId** | [**string**] | Invoice identifier. | defaults to undefined|

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Invoice voided. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
