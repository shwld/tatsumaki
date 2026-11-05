export type TurnstileVerification = {
  token: string;
  hostname: string;
  action: string;
  remoteIp?: string;
};

export interface TurnstileVerifier {
  verify(input: TurnstileVerification): Promise<boolean>;
}
