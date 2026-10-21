import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cyberabad.calquest',
  appName: 'CalQuest',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['generativelanguage.googleapis.com', '*.googleapis.com'],
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    Camera: {
      presentationStyle: 'fullscreen',
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
