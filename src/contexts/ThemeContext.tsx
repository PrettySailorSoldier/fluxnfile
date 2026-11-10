import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  useUserPreferences,
  useUpdateUserPreferences,
  type BackgroundSettings,
  type ThemeMode,
} from '@/hooks/useUserPreferences';
import { useAuth } from '@/contexts/AuthContext';

export type { BackgroundSettings, ThemeMode };

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundImageUrl: string | null;
  backgroundSettings: BackgroundSettings;
  cardColor: string;
  mutedColor: string;
  updateColors: (colors: Partial<CustomColors>) => Promise<void>;
  updateBackgroundSettings: (settings: BackgroundSettings) => void;
  resetTheme: () => Promise<void>;
}

interface CustomColors {
  primaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundImageUrl: string | null;
  cardColor: string;
  mutedColor: string;
}

const defaultBackgroundSettings: BackgroundSettings = {
  zoom: 100,
  positionX: 50,
  positionY: 50,
};

const defaultColors = {
  primaryColor: '#7FE8D8',
  accentColor: '#D896FF',
  textColor: '#1A1A1A',
  cardColor: '#FFFFFF',
  mutedColor: '#6B6B6B',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 50%';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Calculate relative luminance for accessibility
function getLuminance(hex: string): number {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0.5;

  const rgb = [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// Determine if text should be light or dark based on background color
function getContrastingTextColor(bgColor: string): 'light' | 'dark' {
  const luminance = getLuminance(bgColor);
  return luminance > 0.179 ? 'dark' : 'light';
}

// Get accessible foreground HSL based on primary color
function getAccessibleForeground(primaryColor: string): string {
  const contrast = getContrastingTextColor(primaryColor);
  return contrast === 'dark' ? '0 0% 9%' : '0 0% 98%';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: preferences, isLoading } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();

  // Mode state - initialized with user scoping
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      const userSaved = localStorage.getItem(`theme-mode:${user.id}`);
      if (userSaved) return userSaved as ThemeMode;
    }
    return 'system';
  });

  const [isDark, setIsDark] = useState(false);
  const [colors, setColors] = useState<CustomColors>({
    ...defaultColors,
    backgroundImageUrl: null,
  });

  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      const saved = localStorage.getItem(`background-settings:${user.id}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return defaultBackgroundSettings;
        }
      }
    }
    return defaultBackgroundSettings;
  });

  // When user logs out or switches accounts, clean up styles immediately to prevent any bleed
  useEffect(() => {
    if (!user) {
      setColors({ ...defaultColors, backgroundImageUrl: null });
      setBackgroundSettings(defaultBackgroundSettings);
      setModeState('system');
      if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty('--primary');
        document.documentElement.style.removeProperty('--primary-foreground');
        document.documentElement.style.removeProperty('--accent');
        document.documentElement.style.removeProperty('--accent-foreground');
        document.documentElement.style.removeProperty('--ring');
        document.documentElement.style.removeProperty('--nav-active');
        document.body.style.backgroundImage = '';
        document.documentElement.classList.remove('dark');
      }
      return;
    }

    // New user logged in: restore their user-scoped local cache immediately while network query resolves
    try {
      const userMode = localStorage.getItem(`theme-mode:${user.id}`) as ThemeMode | null;
      if (userMode) setModeState(userMode);

      const userBg = localStorage.getItem(`background-settings:${user.id}`);
      if (userBg) setBackgroundSettings(JSON.parse(userBg));
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  // Load user preferences from database (source of truth attached to user_id)
  useEffect(() => {
    if (!user?.id) return;

    if (preferences) {
      setColors({
        primaryColor: preferences.primary_color || defaultColors.primaryColor,
        accentColor: preferences.accent_color || defaultColors.accentColor,
        textColor: preferences.text_color || defaultColors.textColor,
        backgroundImageUrl: preferences.background_image_url || null,
        cardColor: defaultColors.cardColor,
        mutedColor: defaultColors.mutedColor,
      });

      if (preferences.background_settings) {
        setBackgroundSettings(preferences.background_settings);
        try {
          localStorage.setItem(`background-settings:${user.id}`, JSON.stringify(preferences.background_settings));
        } catch {}
      }

      if (preferences.theme_mode) {
        setModeState(preferences.theme_mode);
        try {
          localStorage.setItem(`theme-mode:${user.id}`, preferences.theme_mode);
        } catch {}
      }
    } else if (!isLoading) {
      // User has no custom preferences yet: reset cleanly to defaults so previous user's styles never linger
      setColors({
        ...defaultColors,
        backgroundImageUrl: null,
      });
      setBackgroundSettings(defaultBackgroundSettings);
      setModeState('system');
    }
  }, [preferences, isLoading, user?.id]);

  // Handle system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (mode === 'system') {
        setIsDark(mediaQuery.matches);
      }
    };

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  // Apply mode changes to isDark state
  useEffect(() => {
    if (mode === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(systemDark);
    } else {
      setIsDark(mode === 'dark');
    }
  }, [mode]);

  // Apply dark class to document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Apply custom colors to CSS variables - these persist regardless of dark mode
  useEffect(() => {
    const root = document.documentElement;

    if (colors.primaryColor) {
      root.style.setProperty('--primary', hexToHsl(colors.primaryColor));
      root.style.setProperty('--ring', hexToHsl(colors.primaryColor));
      root.style.setProperty('--nav-active', hexToHsl(colors.primaryColor));
      root.style.setProperty('--primary-foreground', getAccessibleForeground(colors.primaryColor));
    }

    if (colors.accentColor) {
      root.style.setProperty('--accent', hexToHsl(colors.accentColor));
      root.style.setProperty('--accent-foreground', getAccessibleForeground(colors.accentColor));
    }

    if (colors.backgroundImageUrl) {
      document.body.style.backgroundImage = `url(${colors.backgroundImageUrl})`;
      document.body.style.backgroundSize = `${backgroundSettings.zoom}%`;
      document.body.style.backgroundPosition = `${backgroundSettings.positionX}% ${backgroundSettings.positionY}%`;
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundRepeat = 'no-repeat';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.backgroundRepeat = '';
    }

    return () => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-foreground');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--nav-active');
      document.body.style.backgroundImage = '';
    };
  }, [colors, backgroundSettings]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    if (user?.id) {
      try {
        localStorage.setItem(`theme-mode:${user.id}`, newMode);
      } catch {}
      void updatePreferences.mutateAsync({ theme_mode: newMode });
    }
  };

  const updateColors = async (newColors: Partial<CustomColors>) => {
    const updatedColors = { ...colors, ...newColors };
    setColors(updatedColors);

    if (user?.id) {
      await updatePreferences.mutateAsync({
        primary_color: updatedColors.primaryColor,
        accent_color: updatedColors.accentColor,
        text_color: updatedColors.textColor,
        background_image_url: updatedColors.backgroundImageUrl,
      });
    }
  };

  const updateBackgroundSettings = (settings: BackgroundSettings) => {
    setBackgroundSettings(settings);
    if (user?.id) {
      try {
        localStorage.setItem(`background-settings:${user.id}`, JSON.stringify(settings));
      } catch {}
      void updatePreferences.mutateAsync({ background_settings: settings });
    }
  };

  const resetTheme = async () => {
    setColors({ ...defaultColors, backgroundImageUrl: null });
    setBackgroundSettings(defaultBackgroundSettings);

    if (user?.id) {
      try {
        localStorage.removeItem(`background-settings:${user.id}`);
        localStorage.removeItem(`theme-mode:${user.id}`);
      } catch {}
      await updatePreferences.mutateAsync({
        primary_color: null,
        accent_color: null,
        text_color: null,
        background_image_url: null,
        background_settings: null,
      });
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        isDark,
        primaryColor: colors.primaryColor,
        accentColor: colors.accentColor,
        textColor: colors.textColor,
        backgroundImageUrl: colors.backgroundImageUrl,
        backgroundSettings,
        cardColor: colors.cardColor,
        mutedColor: colors.mutedColor,
        updateColors,
        updateBackgroundSettings,
        resetTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
