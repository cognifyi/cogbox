/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BillingApiClient } from '@/billing-api/billingApiClient'
import { DashboardConfig } from '@/types/DashboardConfig'
import {
  Configuration as AnalyticsConfiguration,
  TelemetryApi as AnalyticsTelemetryApi,
  UsageApi as AnalyticsUsageApi,
} from '@cogbox/analytics-api-client'
import { Configuration as BillingConfiguration } from '@cogbox/billing-api-client'
import {
  ApiKeysApi,
  AuditApi,
  Configuration,
  DockerRegistryApi,
  OrganizationsApi,
  RegionsApi,
  RunnersApi,
  SandboxApi,
  SnapshotsApi,
  ToolboxApi,
  UsersApi,
  VolumesApi,
  WebhooksApi,
} from '@cogbox/api-client'
import axios, { AxiosError } from 'axios'
import { CogboxError } from './errors'

const BILLING_REQUEST_TIMEOUT_MS = 5000

function bearerHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export class ApiClient {
  private config: Configuration
  private billingConfig: BillingConfiguration | null = null
  private analyticsConfig: AnalyticsConfiguration | null = null
  private _snapshotApi: SnapshotsApi
  private _sandboxApi: SandboxApi
  private _userApi: UsersApi
  private _apiKeyApi: ApiKeysApi
  private _dockerRegistryApi: DockerRegistryApi
  private _organizationsApi: OrganizationsApi
  private _billingApi: BillingApiClient
  private _volumeApi: VolumesApi
  private _toolboxApi: ToolboxApi
  private _auditApi: AuditApi
  private _regionsApi: RegionsApi
  private _runnersApi: RunnersApi
  private _webhooksApi: WebhooksApi
  private _analyticsUsageApi: AnalyticsUsageApi | null
  private _analyticsTelemetryApi: AnalyticsTelemetryApi | null

  constructor(config: DashboardConfig, accessToken: string) {
    this.config = new Configuration({
      basePath: config.apiUrl,
      accessToken: accessToken,
    })

    const axiosInstance = axios.create()
    axiosInstance.interceptors.response.use(
      (response) => {
        return response
      },
      (error) => {
        let errorMessage: string

        if (error instanceof AxiosError && error.message.includes('timeout of')) {
          errorMessage = 'Operation timed out'
        } else {
          errorMessage = error.response?.data?.message || error.response?.data || error.message || String(error)
        }

        throw CogboxError.fromString(String(errorMessage), { cause: error instanceof Error ? error : undefined })
      },
    )

    // Initialize APIs
    this._snapshotApi = new SnapshotsApi(this.config, undefined, axiosInstance)
    this._sandboxApi = new SandboxApi(this.config, undefined, axiosInstance)
    this._userApi = new UsersApi(this.config, undefined, axiosInstance)
    this._apiKeyApi = new ApiKeysApi(this.config, undefined, axiosInstance)
    this._dockerRegistryApi = new DockerRegistryApi(this.config, undefined, axiosInstance)
    this._organizationsApi = new OrganizationsApi(this.config, undefined, axiosInstance)
    this.billingConfig = new BillingConfiguration({
      basePath: config.billingApiUrl || window.location.origin,
      accessToken: accessToken,
      baseOptions: {
        headers: bearerHeaders(accessToken),
        timeout: BILLING_REQUEST_TIMEOUT_MS,
      },
    })
    this._billingApi = new BillingApiClient(this.billingConfig, axiosInstance)
    this._volumeApi = new VolumesApi(this.config, undefined, axiosInstance)
    this._toolboxApi = new ToolboxApi(this.config, undefined, axiosInstance)
    this._auditApi = new AuditApi(this.config, undefined, axiosInstance)
    this._regionsApi = new RegionsApi(this.config, undefined, axiosInstance)
    this._runnersApi = new RunnersApi(this.config, undefined, axiosInstance)
    this._webhooksApi = new WebhooksApi(this.config, undefined, axiosInstance)

    if (config.analyticsApiUrl) {
      this.analyticsConfig = new AnalyticsConfiguration({
        basePath: config.analyticsApiUrl,
        accessToken: accessToken,
        baseOptions: {
          headers: bearerHeaders(accessToken),
        },
      })
      this._analyticsUsageApi = new AnalyticsUsageApi(this.analyticsConfig, undefined, axiosInstance)
      this._analyticsTelemetryApi = new AnalyticsTelemetryApi(this.analyticsConfig, undefined, axiosInstance)
    } else {
      this._analyticsUsageApi = null
      this._analyticsTelemetryApi = null
    }
  }

  public setAccessToken(accessToken: string) {
    this.config.accessToken = accessToken

    for (const generatedConfig of [this.billingConfig, this.analyticsConfig]) {
      if (!generatedConfig) {
        continue
      }

      generatedConfig.accessToken = accessToken
      generatedConfig.baseOptions = {
        ...generatedConfig.baseOptions,
        headers: {
          ...generatedConfig.baseOptions?.headers,
          ...bearerHeaders(accessToken),
        },
      }
    }
  }

  public get snapshotApi() {
    return this._snapshotApi
  }

  public get sandboxApi() {
    return this._sandboxApi
  }

  public get userApi() {
    return this._userApi
  }

  public get apiKeyApi() {
    return this._apiKeyApi
  }

  public get dockerRegistryApi() {
    return this._dockerRegistryApi
  }

  public get organizationsApi() {
    return this._organizationsApi
  }

  public get billingApi() {
    return this._billingApi
  }

  public get volumeApi() {
    return this._volumeApi
  }

  public get toolboxApi() {
    return this._toolboxApi
  }

  public get auditApi() {
    return this._auditApi
  }

  public get regionsApi() {
    return this._regionsApi
  }

  public get runnersApi() {
    return this._runnersApi
  }

  public get webhooksApi() {
    return this._webhooksApi
  }

  public get analyticsUsageApi() {
    return this._analyticsUsageApi
  }

  public get analyticsTelemetryApi() {
    return this._analyticsTelemetryApi
  }

  public async webhookRequest(method: string, url: string, data?: any) {
    // Use the existing axios instance that's already configured with interceptors
    const axiosInstance = axios.create({
      baseURL: this.config.basePath,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    })

    return axiosInstance.request({
      method,
      url,
      data,
    })
  }

  public get axiosInstance() {
    return axios.create({
      baseURL: this.config.basePath,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    })
  }
}
