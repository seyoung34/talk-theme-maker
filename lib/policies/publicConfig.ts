export type PublicBusinessInfo = {
  serviceName: string;
  operatorName?: string;
  representativeName?: string;
  businessRegistrationNumber?: string;
  ecommerceRegistrationNumber?: string;
  businessAddress?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportHours?: string;
  privacyContactName?: string;
  privacyContactEmail?: string;
  privacyContactPhone?: string;
};

const defaultPublicBusinessInfo = {
  operatorName: "토비토비",
  representativeName: "이세영",
  businessRegistrationNumber: "477-33-01890",
  businessAddress: "강원특별자치도 춘천시 공지로264번길 25-13, 204호(효자동)",
  supportEmail: "jupi0304@naver.com",
  supportPhone: "010-3372-4784",
  privacyContactName: "이세영",
  privacyContactEmail: "jupi0304@naver.com",
  privacyContactPhone: "010-3372-4784",
} satisfies Partial<PublicBusinessInfo>;

export function getPublicBusinessInfo(): PublicBusinessInfo {
  return {
    serviceName: "TalkTheme",
    operatorName: readPublicValue("NEXT_PUBLIC_BUSINESS_NAME") ?? defaultPublicBusinessInfo.operatorName,
    representativeName: readPublicValue("NEXT_PUBLIC_BUSINESS_REPRESENTATIVE") ?? defaultPublicBusinessInfo.representativeName,
    businessRegistrationNumber: readPublicValue("NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER") ?? defaultPublicBusinessInfo.businessRegistrationNumber,
    ecommerceRegistrationNumber: readPublicValue("NEXT_PUBLIC_ECOMMERCE_REGISTRATION_NUMBER"),
    businessAddress: readPublicValue("NEXT_PUBLIC_BUSINESS_ADDRESS") ?? defaultPublicBusinessInfo.businessAddress,
    supportEmail: readPublicValue("NEXT_PUBLIC_SUPPORT_EMAIL") ?? defaultPublicBusinessInfo.supportEmail,
    supportPhone: readPublicValue("NEXT_PUBLIC_SUPPORT_PHONE") ?? defaultPublicBusinessInfo.supportPhone,
    supportHours: readPublicValue("NEXT_PUBLIC_SUPPORT_HOURS"),
    privacyContactName: readPublicValue("NEXT_PUBLIC_PRIVACY_CONTACT_NAME") ?? defaultPublicBusinessInfo.privacyContactName,
    privacyContactEmail: readPublicValue("NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL") ?? defaultPublicBusinessInfo.privacyContactEmail,
    privacyContactPhone: readPublicValue("NEXT_PUBLIC_PRIVACY_CONTACT_PHONE") ?? defaultPublicBusinessInfo.privacyContactPhone,
  };
}

function readPublicValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}
