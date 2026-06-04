import type { SmsAdapter, SendSmsInput, SendSmsResult } from "../types.js";
import { outbox, mockId } from "./outbox.js";

export class MockSmsAdapter implements SmsAdapter {
  readonly name = "mock-sms";

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const providerMessageId = mockId("sm");
    const id = outbox.record(
      {
        kind: "sms",
        to: input.to,
        from: input.from,
        body: input.body,
        providerMessageId,
        at: new Date().toISOString(),
      },
      input.idempotencyKey,
    );
    return { providerMessageId: id, status: "sent" };
  }
}
