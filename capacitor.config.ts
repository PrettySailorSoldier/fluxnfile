import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.exnihilo.fluxfile',
  appName: 'Flux&File',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#09090b',
    },
  },
};

export default config;
