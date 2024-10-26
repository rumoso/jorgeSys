import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ruitza.truckManagerApp',
  appName: 'Truck Manager App',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
