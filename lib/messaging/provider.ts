import type { Channel } from '@prisma/client';

export type ProviderSendInput = { recipient: string; content: string; idempotencyKey: string };
export type ProviderSendResult = { providerMessageId: string; acceptedAt: Date };

/** Provider contract only. A concrete adapter and server-side credentials are required before sending can be enabled. */
export interface MessagingProvider {
  readonly name: string;
  readonly channel: Channel;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

export function getMessagingProvider(): MessagingProvider | null {
  // Intentionally disabled until a business provider, account, and webhook credentials are configured.
  return null;
}
