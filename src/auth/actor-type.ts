/** The kind of actor a reference points to. */
export const ActorType = {
  Employee: 'employee',
  Partner: 'partner',
  Bookkeeper: 'bookkeeper',
  Company: 'company',
  System: 'system',
  ApiIntegration: 'api_integration',
} as const

export type ActorType = (typeof ActorType)[keyof typeof ActorType]

export function isActorType(value: string): value is ActorType {
  return Object.values(ActorType).some((type) => type === value)
}
