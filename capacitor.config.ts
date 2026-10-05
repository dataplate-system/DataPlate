import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.dataplate.app',
  appName: 'DataPlate',
  webDir: 'frontend',
  server: {
    appStartPath: '/pages/adm-login.html',
    androidScheme: 'http',
    cleartext: true
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#111827'
  }
};

export default config;
