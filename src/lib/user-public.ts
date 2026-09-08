/** Fields safe to send into RSC / JSON. Never include passwordHash or totpSecret. */
export const USER_SAFE_SELECT = {
  id: true,
  login: true,
  lastName: true,
  firstName: true,
  middleName: true,
  photoFileId: true,
  phone: true,
  email: true,
  status: true,
} as const;

export const USER_SAFE_ORG_SELECT = {
  ...USER_SAFE_SELECT,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
} as const;
