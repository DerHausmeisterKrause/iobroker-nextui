import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
	theme: Theme;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren): JSX.Element {
	const [theme, setTheme] = useState<Theme>(() => {
		const savedTheme = window.localStorage.getItem('nextui-theme');
		if (savedTheme === 'light' || savedTheme === 'dark') {
			return savedTheme;
		}
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	});

	useEffect(() => {
		document.documentElement.classList.toggle('dark', theme === 'dark');
		window.localStorage.setItem('nextui-theme', theme);
	}, [theme]);

	return (
		<ThemeContext.Provider
			value={{ theme, toggleTheme: () => setTheme(current => (current === 'dark' ? 'light' : 'dark')) }}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used inside ThemeProvider');
	}
	return context;
}
