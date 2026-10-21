import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cyberabad.calquest',
  appName: 'CalQuest AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      presentationStyle: 'fullscreen',
    },
  },
};

export default config;
