export interface SmsService {
  sendOtp(phone: string, code: string): Promise<void>;
  sendNotification(phone: string, message: string): Promise<void>;
}

export class FakeSmsService implements SmsService {
  async sendOtp(_phone: string, _code: string): Promise<void> {
    // Placeholder for later provider integration.
  }

  async sendNotification(_phone: string, _message: string): Promise<void> {
    // Placeholder for later provider integration.
  }
}
