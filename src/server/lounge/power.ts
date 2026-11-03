// التحكم في الكهرباء (قريباً): واجهة adapter للمقابس الذكية (Tuya / Shelly عبر API محلي) تطفي الجهاز لما الوقت يخلص.
// المنطق فاضي لين يجهز التكامل، زي صندوق الرسائل.
export interface PowerAdapter {
  readonly name: string;
  turnOff(stationId: string): Promise<void>;
  turnOn(stationId: string): Promise<void>;
}

export const noopPower: PowerAdapter = {
  name: "قريباً",
  async turnOff() { /* قريباً */ },
  async turnOn() { /* قريباً */ },
};

export const POWER_PROVIDERS = [
  { key: "tuya", name: "Tuya (مقابس ذكية)", status: "soon" as const },
  { key: "shelly", name: "Shelly (API محلي)", status: "soon" as const },
];
