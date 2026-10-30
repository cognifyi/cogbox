/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  AutomaticTopUp,
  BillingInfo,
  BillingInfoApi,
  ChargeList,
  Configuration,
  CouponApi,
  EmailApi,
  InvoicesApi,
  OrganizationEmail,
  OrganizationTier,
  OrganizationUsage,
  OrganizationWallet,
  PaginatedTInvoice,
  PaymentMethod,
  PaymentUrl,
  PortalApi,
  Tier,
  TierApi,
  UsageApi,
  WalletApi,
} from '@cogbox/billing-api-client'
import { AxiosInstance } from 'axios'

export class BillingApiClient {
  private walletApi: WalletApi
  private usageApi: UsageApi
  private tierApi: TierApi
  private invoicesApi: InvoicesApi
  private emailApi: EmailApi
  private couponApi: CouponApi
  private portalApi: PortalApi
  private billingInfoApi: BillingInfoApi

  constructor(configuration: Configuration, axiosInstance: AxiosInstance) {
    this.walletApi = new WalletApi(configuration, undefined, axiosInstance)
    this.usageApi = new UsageApi(configuration, undefined, axiosInstance)
    this.tierApi = new TierApi(configuration, undefined, axiosInstance)
    this.invoicesApi = new InvoicesApi(configuration, undefined, axiosInstance)
    this.emailApi = new EmailApi(configuration, undefined, axiosInstance)
    this.couponApi = new CouponApi(configuration, undefined, axiosInstance)
    this.portalApi = new PortalApi(configuration, undefined, axiosInstance)
    this.billingInfoApi = new BillingInfoApi(configuration, undefined, axiosInstance)
  }

  public async getOrganizationUsage(organizationId: string): Promise<OrganizationUsage> {
    const response = await this.usageApi.getV2CurrentUsage(organizationId)
    return response.data
  }

  public async getPastOrganizationUsage(organizationId: string, periods?: number): Promise<OrganizationUsage[]> {
    const response = await this.usageApi.getV2PastUsage(organizationId, periods ?? 12)
    return response.data
  }

  public async getOrganizationWallet(organizationId: string): Promise<OrganizationWallet> {
    const response = await this.walletApi.getV2Wallet(organizationId)
    return response.data
  }

  public async setAutomaticTopUp(organizationId: string, automaticTopUp?: AutomaticTopUp): Promise<void> {
    await this.walletApi.setV2AutomaticTopUp(organizationId, automaticTopUp ?? {})
  }

  public async getOrganizationBillingPortalUrl(organizationId: string): Promise<string> {
    const response = await this.portalApi.getV2PortalURL(organizationId)
    return response.data
  }

  public async redeemCoupon(organizationId: string, couponCode: string): Promise<string> {
    await this.couponApi.redeemV2Coupon(organizationId, couponCode)
    return 'Coupon redeemed successfully'
  }

  public async listInvoices(organizationId: string, page?: number, perPage?: number): Promise<PaginatedTInvoice> {
    const response = await this.invoicesApi.listV2Invoices(organizationId, page, perPage)
    return response.data
  }

  public async createInvoicePaymentUrl(organizationId: string, invoiceId: string): Promise<PaymentUrl> {
    const response = await this.invoicesApi.createV2PaymentURL(organizationId, invoiceId)
    return response.data
  }

  public async topUpWallet(organizationId: string, amountCents: number): Promise<PaymentUrl> {
    const response = await this.walletApi.topUpV2Wallet(organizationId, { amountCents })
    return response.data
  }

  // Tier + email endpoints have no v2 counterpart; they always call v1.

  public async getOrganizationTier(organizationId: string): Promise<OrganizationTier> {
    const response = await this.tierApi.getTier(organizationId)
    return response.data
  }

  public async upgradeTier(organizationId: string, tier: number): Promise<void> {
    await this.tierApi.upgradeTier(organizationId, { tier })
  }

  public async downgradeTier(organizationId: string, tier: number): Promise<void> {
    await this.tierApi.downgradeTier(organizationId, { tier })
  }

  public async listTiers(): Promise<Tier[]> {
    const response = await this.tierApi.listTiers()
    return response.data
  }

  public async listOrganizationEmails(organizationId: string): Promise<OrganizationEmail[]> {
    const response = await this.emailApi.listOrganizationEmails(organizationId)
    return response.data
  }

  public async addOrganizationEmail(organizationId: string, email: string): Promise<void> {
    await this.emailApi.addOrganizationEmail(organizationId, { email })
  }

  public async deleteOrganizationEmail(organizationId: string, email: string): Promise<void> {
    await this.emailApi.deleteOrganizationEmail(organizationId, { email })
  }

  public async verifyOrganizationEmail(organizationId: string, email: string, token: string): Promise<void> {
    await this.emailApi.verifyEmail(organizationId, { email, token })
  }

  public async resendOrganizationEmailVerification(organizationId: string, email: string): Promise<void> {
    await this.emailApi.resendVerificationEmail(organizationId, { email })
  }

  public async getBillingInfo(organizationId: string): Promise<BillingInfo> {
    const response = await this.billingInfoApi.getV2BillingInfo(organizationId)
    return response.data
  }

  public async listPaymentMethods(organizationId: string): Promise<PaymentMethod[]> {
    const response = await this.billingInfoApi.listV2PaymentMethods(organizationId)
    return response.data
  }

  public async listCharges(
    organizationId: string,
    { limit, startingAfter }: { limit?: number; startingAfter?: string } = {},
  ): Promise<ChargeList> {
    const response = await this.billingInfoApi.listV2Charges(organizationId, limit, startingAfter)
    return response.data
  }
}
