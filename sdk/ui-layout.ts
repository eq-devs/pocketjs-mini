/** Bounded UI strings are wrapped with the same baked-font measurer that paints them.
 * Split only between Unicode scalars; explicit empty lines remain visible. */
export function wrapUI(value: string, width: number, measure: (text: string) => number): string[] {
  const rows: string[]=[];
  for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')) {
    let line='';
    for(const scalar of paragraph) {
      const candidate=line+scalar;
      if(line && measure(candidate)>width){rows.push(line);line=scalar;}else line=candidate;
    }
    rows.push(line);
  }
  return rows;
}
