/* eslint-disable @typescript-eslint/no-unused-vars */
export type Mods = Record<string, boolean | undefined>;

export function classNames(
  cls: string,
  mods: Mods = {},
  additional: (string | undefined)[] = [],
): string {
  return [
    cls,
    ...additional.filter(Boolean),
    ...Object.entries(mods)
      .filter(([_, value]) => value)
      .map(([className]) => className),
  ].join(' ');
}
