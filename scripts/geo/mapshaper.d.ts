/** The bit of mapshaper's API the NYC map build uses (scripts/geo/5_nyc.ts). */
declare module 'mapshaper' {
  const mapshaper: { applyCommands(cmd: string, inputs?: Record<string, unknown>): Promise<Record<string, string | Uint8Array>> };
  export default mapshaper;
}
