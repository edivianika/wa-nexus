import { createContext, useContext, useEffect, useState } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("ui-theme") as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      
      root.classList.add(systemTheme);
      return;
    }
    
    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem("ui-theme", theme);
      setTheme(theme);
    },
  };

  // Novalara color palette
  const novalara = {
    primary: {
      main: '#3b82f6', // primary blue
      light: '#60a5fa',
      dark: '#2563eb',
    },
    secondary: {
      main: '#8b5cf6', // purple
      light: '#a78bfa',
      dark: '#7c3aed',
    },
    success: {
      main: '#10b981', // green
      light: '#34d399',
      dark: '#059669',
    },
    warning: {
      main: '#f59e0b', // amber
      light: '#fbbf24',
      dark: '#d97706',
    },
    error: {
      main: '#ef4444', // red
      light: '#f87171',
      dark: '#dc2626',
    },
    info: {
      main: '#3b82f6', // blue
      light: '#60a5fa',
      dark: '#2563eb',
    },
    grey: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },
  };

  // Custom MUI theme with Novalara colors
  const muiTheme = createTheme({
    palette: {
      mode: theme === 'dark' ? 'dark' : 'light',
      background: {
        default: theme === 'dark' ? '#141b2d' : '#f8fafc',
        paper: theme === 'dark' ? '#1f2940' : '#ffffff',
      },
      primary: novalara.primary,
      secondary: novalara.secondary,
      error: novalara.error,
      warning: novalara.warning,
      info: novalara.info,
      success: novalara.success,
      text: {
        primary: theme === 'dark' ? '#f8fafc' : '#111827',
        secondary: theme === 'dark' ? '#9ca3af' : '#4b5563',
      },
      divider: theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
    },
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: {
        fontWeight: 600,
      },
      h2: {
        fontWeight: 600,
      },
      h3: {
        fontWeight: 600,
      },
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
      subtitle1: {
        fontSize: '1rem',
      },
      subtitle2: {
        fontSize: '0.875rem',
      },
      body1: {
        fontSize: '1rem',
      },
      body2: {
        fontSize: '0.875rem',
      },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: theme === 'dark' ? '#1f2940' : '#ffffff',
            color: theme === 'dark' ? '#f8fafc' : '#111827',
            borderRadius: '0.5rem',
            boxShadow: theme === 'dark' 
              ? '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -2px rgba(0, 0, 0, 0.2)' 
              : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: theme === 'dark' ? '#283047' : '#f8fafc',
            color: theme === 'dark' ? '#f8fafc' : '#111827',
            borderRadius: '0.375rem',
          },
          input: {
            color: theme === 'dark' ? '#f8fafc' : '#111827',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: '0.375rem',
            textTransform: 'none',
            fontWeight: 500,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
            },
          },
          contained: {
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            '&:hover': {
              backgroundColor: '#2563eb',
            },
          },
          outlined: {
            borderColor: theme === 'dark' ? '#3b82f6' : '#3b82f6',
            color: theme === 'dark' ? '#3b82f6' : '#3b82f6',
            '&:hover': {
              backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
            },
          },
          text: {
            color: '#3b82f6',
            '&:hover': {
              backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: theme === 'dark' ? '1px solid #283047' : '1px solid #e5e7eb',
            padding: '12px 16px',
          },
          head: {
            backgroundColor: theme === 'dark' ? '#1f2940' : '#f9fafb',
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: theme === 'dark' ? '#283047' : '#f9fafb',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: '9999px',
            fontWeight: 500,
          },
        },
      },
    },
  });

  return (
    <ThemeProviderContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
      {children}
      </MuiThemeProvider>
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  
  return context;
};
