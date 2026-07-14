/**
 * Relationship between a node's actor and the actor in its `act` node.
 * */
export const ActType = {
  AdminBecome: 'admin_become',
  StaffBecome: 'staff_become',
} as const

export type ActType = (typeof ActType)[keyof typeof ActType]

export function isActType(value: string): value is ActType {
  return Object.values(ActType).some((type) => type === value)
}
