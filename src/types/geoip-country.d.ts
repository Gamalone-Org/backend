declare module 'geoip-country' {
  interface GeoipCountry {
    country: string;
  }
  const geoip: { lookup(ip: string): GeoipCountry | null };
  export default geoip;
}
