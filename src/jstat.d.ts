declare module 'jstat' {
  interface Distribution {
    cdf(x: number, ...params: number[]): number;
  }
  const jStat: {
    studentt: Distribution;
  };
  export default jStat;
}
