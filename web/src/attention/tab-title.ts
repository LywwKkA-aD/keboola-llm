/** The browser tab title: how many approvals wait, in front of the app name, so it shows from any tab. */
export const tabTitle = (base: string, waiting: number): string => (waiting > 0 ? `(${waiting}) ${base}` : base);
