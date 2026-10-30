# UsageEvent


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**event_id** | **string** | Globally unique event identifier, e.g. &#x60;cogbox:period:&lt;id&gt;&#x60;. | [default to undefined]
**product** | **string** |  | [default to undefined]
**org_id** | **string** |  | [default to undefined]
**user_id** | **string** |  | [optional] [default to undefined]
**sandbox_id** | **string** |  | [optional] [default to undefined]
**metric** | **string** | Known values: &#x60;sandbox_seconds&#x60;, &#x60;cpu_seconds&#x60;, &#x60;gpu_seconds&#x60;, &#x60;mem_gb_seconds&#x60;, &#x60;disk_gb_seconds&#x60;, and &#x60;adjustment&#x60; for correction entries. New metrics may be added without a breaking contract change.  | [default to undefined]
**quantity** | **number** | Non-negative for usage metrics; may be negative for &#x60;adjustment&#x60;. | [default to undefined]
**unit** | **string** | Known values: &#x60;second&#x60;, &#x60;gb_hour&#x60;, &#x60;request&#x60;, and &#x60;gb_second&#x60;. Must match the unit configured in &#x60;price_book&#x60;.  | [default to undefined]
**occurred_at** | **Date** |  | [default to undefined]
**price_version** | **string** | Price book version, e.g. &#x60;2026-10&#x60;. | [default to undefined]
**corrects_event_id** | **string** | When set, this event corrects the referenced event. The original event is never overwritten; billing records a compensating entry.  | [optional] [default to undefined]
**source_revision** | **number** | Revision number for the same &#x60;event_id&#x60;; defaults to 1. | [optional] [default to undefined]
**metadata** | **{ [key: string]: any; }** |  | [optional] [default to undefined]

## Example

```typescript
import { UsageEvent } from './api';

const instance: UsageEvent = {
    event_id,
    product,
    org_id,
    user_id,
    sandbox_id,
    metric,
    quantity,
    unit,
    occurred_at,
    price_version,
    corrects_event_id,
    source_revision,
    metadata,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
