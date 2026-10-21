import { createTheme, alpha } from '@mui/material/styles';

export const calQuestTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#10B981', // Vibrant Emerald
      light: '#34D399',
      dark: '#059669',
      contrastText: '#041E15',
    },
    secondary: {
      main: '#F59E0B', // Gamified Gold / Flame
      light: '#FBBF24',
      dark: '#D97706',
      contrastText: '#1F1200',
    },
    info: {
      main: '#38BDF8', // Streak Freeze Sky Blue
    },
    error: {
      main: '#FB7185', // Protein / Alert Coral Rose
    },
    success: {
      main: '#10B981',
    },
    background: {
      default: '#0B0F19',
      paper: '#131B2E',
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
    },
    divider: 'rgba(148, 163, 184, 0.12)',
  },
  shape: {
    borderRadius: 20,
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.02em',
    },
    h5: {
      fontWeight: 800,
      letterSpacing: '-0.01em',
    },
    h6: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    subtitle1: {
      fontWeight: 700,
    },
    subtitle2: {
      fontWeight: 700,
    },
    button: {
      fontWeight: 700,
      textTransform: 'none',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage:
            'linear-gradient(145deg, rgba(30, 41, 59, 0.72) 0%, rgba(15, 23, 42, 0.92) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(148, 163, 184, 0.14)',
          boxShadow: '0 12px 32px -8px rgba(0, 0, 0, 0.45)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 18,
          paddingRight: 18,
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #10B981 0%, #14B8A6 100%)',
          color: '#031C14',
          boxShadow: `0 8px 20px -4px ${alpha('#10B981', 0.45)}`,
          '&:hover': {
            background: 'linear-gradient(135deg, #34D399 0%, #2DD4BF 100%)',
          },
        },
        containedSecondary: {
          background: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
          color: '#1E1102',
          boxShadow: `0 6px 16px -4px ${alpha('#F59E0B', 0.4)}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          borderRadius: 12,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          height: 8,
          backgroundColor: 'rgba(148, 163, 184, 0.16)',
        },
        bar: {
          borderRadius: 999,
        },
      },
    },
  },
});
