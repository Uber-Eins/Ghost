export function constructDateWithNewTarget(
  DateConstructor: DateConstructor,
  args: unknown[],
  newTarget: Function
): Date {
  return Reflect.construct(DateConstructor, args, newTarget) as Date;
}
