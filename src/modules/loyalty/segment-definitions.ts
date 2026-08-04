export const SEGMENT_KEYS = [
  'vip',
  'new',
  'at_risk',
  'lost',
  'regular',
] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

export const SEGMENT_DEFINITIONS: {
  key: SegmentKey;
  label: string;
  description: string;
}[] = [
  {
    key: 'vip',
    label: 'مشتریان ویژه',
    description: 'فرکانس خرید بالا و ارزش پولی در ۲۰٪ برتر مشتریان',
  },
  {
    key: 'new',
    label: 'مشتریان جدید',
    description: 'دقیقاً یک خرید، در ۳۰ روز اخیر',
  },
  {
    key: 'at_risk',
    label: 'در معرض ریزش',
    description:
      'بین آخرین آستانهٔ فعال تا آستانهٔ از دست رفته از آخرین خرید گذشته',
  },
  {
    key: 'lost',
    label: 'از دست رفته',
    description: 'مدت زیادی از آخرین خرید گذشته و در سایر سگمنت‌ها جا نمی‌شود',
  },
  {
    key: 'regular',
    label: 'مشتریان عادی',
    description: 'هیچ‌کدام از قوانین دیگر صدق نمی‌کند',
  },
];
