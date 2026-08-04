export interface SegmentationRulesConfig {
  vip: {
    minFrequency: number;
    /** سهم بالای توزیع ارزش پولی که "برتر" حساب می‌شود، مثلاً 0.2 = ۲۰٪ برتر */
    monetaryTopPercentile: number;
  };
  new: {
    maxFrequency: number;
    maxRecencyDays: number;
  };
  atRisk: {
    minRecencyDays: number;
    maxRecencyDays: number;
  };
  lost: {
    minRecencyDays: number;
  };
}

/**
 * آستانه‌های قانون سگمنت‌بندی RFM باشگاه مشتریان.
 * برای تغییر رفتار سگمنت‌ها فقط همین فایل را ویرایش کنید — منطق در SegmentationService ثابت می‌ماند.
 */
export const segmentationRulesConfig: SegmentationRulesConfig = {
  vip: { minFrequency: 5, monetaryTopPercentile: 0.2 },
  new: { maxFrequency: 1, maxRecencyDays: 30 },
  atRisk: { minRecencyDays: 60, maxRecencyDays: 120 },
  lost: { minRecencyDays: 120 },
};
