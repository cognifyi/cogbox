# BillingSummary


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**organizationId** | **string** |  | [default to undefined]
**currency** | **string** |  | [default to undefined]
**balanceCents** | **number** | Settled wallet balance in minor currency units. | [default to undefined]
**ongoingBalanceCents** | **number** | Sum of open-period estimates plus unsettled adjustments. | [default to undefined]
**currentPeriodEstimatedCents** | **number** | Estimate only; not posted to the ledger. | [optional] [default to undefined]
**currentPeriodStart** | **Date** |  | [optional] [default to undefined]
**currentPeriodEnd** | **Date** |  | [optional] [default to undefined]
**status** | **string** | Product-facing billing state. &#x60;pending_payment&#x60; means the organization is awaiting its first payment method or payment.  | [default to undefined]
**plan** | [**BillingPlan**](BillingPlan.md) |  | [optional] [default to undefined]
**suspended** | **boolean** |  | [optional] [default to undefined]
**suspensionReason** | **string** |  | [optional] [default to undefined]
**suspensionUntil** | **Date** |  | [optional] [default to undefined]
**paymentMethodAttached** | **boolean** |  | [optional] [default to undefined]

## Example

```typescript
import { BillingSummary } from './api';

const instance: BillingSummary = {
    organizationId,
    currency,
    balanceCents,
    ongoingBalanceCents,
    currentPeriodEstimatedCents,
    currentPeriodStart,
    currentPeriodEnd,
    status,
    plan,
    suspended,
    suspensionReason,
    suspensionUntil,
    paymentMethodAttached,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
